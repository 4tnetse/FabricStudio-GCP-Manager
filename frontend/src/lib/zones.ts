export function zoneLabel(zone: string, locations: Record<string, string>): string {
  const region = zone.replace(/-[a-z]$/, '')
  const location = locations[region]
  return location ? `${zone} (${location})` : zone
}
