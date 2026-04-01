"""Send schedule run notifications to a Microsoft Teams Workflow webhook."""
import httpx


async def notify_teams(
    webhook_url: str,
    schedule_name: str,
    job_type: str,
    status: str,
    project_id: str,
    triggered_by: str,
    error_summary: str | None = None,
) -> None:
    """POST a message to the given Teams Workflow webhook URL. Best-effort — never raises."""
    if not webhook_url:
        return

    success = status == "completed"
    status_text = "✅ Completed" if success else "❌ Failed"
    job_type_label = {"clone": "Clone", "configure": "Configure", "ssh": "SSH"}.get(job_type, job_type.capitalize())

    accent_color = "Good" if success else "Attention"

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
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": f"Fabric Studio GCP Manager — Schedule '{schedule_name}' {status_text}",
                            "weight": "Bolder",
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": f"Job type: {job_type_label} | Project: {project_id or '—'} | Triggered by: {triggered_by}",
                            "wrap": True,
                            "spacing": "Small",
                        },
                    ],
                },
            ],
        }
    ]
    if error_summary:
        body.append({"type": "TextBlock", "text": f"Error: {error_summary}", "color": "Attention", "wrap": True, "spacing": "Small"})

    payload = {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "type": "AdaptiveCard",
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "version": "1.2",
                "body": body,
            },
        }],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(webhook_url, json=payload)
    except Exception as exc:
        print(f"[teams_notify] failed to send notification: {exc}", flush=True)
