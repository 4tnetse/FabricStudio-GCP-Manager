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

    lines = [
        f"**Fabric Studio — Schedule '{schedule_name}' {status_text}**",
        f"Job type: {job_type.capitalize()} | Project: {project_id or '—'} | Triggered by: {triggered_by}",
    ]
    if error_summary:
        lines.append(f"Error: {error_summary}")

    payload = {"text": "\n\n".join(lines)}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(webhook_url, json=payload)
    except Exception as exc:
        print(f"[teams_notify] failed to send notification: {exc}", flush=True)
