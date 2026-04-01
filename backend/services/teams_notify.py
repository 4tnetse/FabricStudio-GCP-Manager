"""Send schedule run notifications to a Microsoft Teams Workflow webhook."""
from datetime import datetime, timezone

import httpx


def _format_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m}m {s}s"
    h, m = divmod(m, 60)
    return f"{h}h {m}m"


async def notify_teams(
    webhook_url: str,
    schedule_name: str,
    job_type: str,
    status: str,
    project_id: str,
    triggered_by: str,
    started_at: datetime | None = None,
    duration_seconds: float | None = None,
    instance_count: int | None = None,
    error_lines: list[str] | None = None,
) -> None:
    """POST a message to the given Teams Workflow webhook URL. Best-effort — never raises."""
    if not webhook_url:
        return

    success = status == "completed"
    status_text = "✅ Completed" if success else "❌ Failed"
    job_type_label = {"clone": "Clone", "configure": "Configure", "ssh": "SSH"}.get(job_type, job_type.capitalize())
    accent_color = "Good" if success else "Attention"

    facts = [
        {"title": "Schedule", "value": schedule_name},
        {"title": "Status", "value": status_text},
        {"title": "Job type", "value": job_type_label},
        {"title": "Project", "value": project_id or "—"},
        {"title": "Triggered by", "value": triggered_by.capitalize()},
    ]
    if started_at is not None:
        facts.append({"title": "Started", "value": started_at.strftime("%Y-%m-%d %H:%M UTC")})
    if duration_seconds is not None:
        facts.append({"title": "Duration", "value": _format_duration(duration_seconds)})
    if instance_count is not None:
        facts.append({"title": "Instances", "value": str(instance_count)})

    column_items: list[dict] = [
        {
            "type": "TextBlock",
            "text": f"Fabric Studio GCP Manager {status_text}",
            "weight": "Bolder",
            "wrap": True,
        },
        {
            "type": "FactSet",
            "facts": facts,
            "spacing": "Small",
        },
    ]

    if not success and error_lines:
        snippet = "\n".join(error_lines)
        column_items.append({
            "type": "TextBlock",
            "text": snippet,
            "wrap": True,
            "color": "Attention",
            "fontType": "Monospace",
            "spacing": "Small",
        })

    body = [
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "style": accent_color,
                    "items": [{"type": "TextBlock", "text": " ", "color": accent_color}],
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": column_items,
                },
            ],
        }
    ]

    preview = f"Schedule '{schedule_name}' {status_text}"
    payload = {
        "type": "message",
        "text": preview,
        "summary": preview,
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "version": "1.2",
                "speak": preview,
                "body": body,
            },
        }],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(webhook_url, json=payload)
    except Exception as exc:
        print(f"[teams_notify] failed to send notification: {exc}", flush=True)
