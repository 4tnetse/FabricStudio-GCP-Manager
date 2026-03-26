export interface Instance {
  name: string
  zone: string
  status: 'RUNNING' | 'TERMINATED' | 'STAGING' | 'STOPPING' | 'PROVISIONING' | 'UNKNOWN'
  machine_type: string
  public_ip: string | null
  internal_ip: string | null
  labels: Record<string, string>
  tags: string[]
  creation_timestamp: string | null
  boot_disk_gb: number | null
}

export interface ProjectInfo {
  id: string
  name: string
}

export interface KeyInfo {
  id: string
  display_name: string
  filename: string
  client_email: string
  projects: ProjectInfo[]
}

export interface Project {
  id: string
  name: string
  is_selected?: boolean
  key_id?: string
  key_name?: string
}

export interface Settings {
  service_account_key_path: string | null
  service_account_key_name?: string | null
  active_key_id?: string | null
  active_project_id?: string | null
  initials: string | null
  default_zone: string | null
  default_type: string | null
  owner: string | null
  group: string | null
  ssh_public_key: string | null
  dns_domain: string | null
  instance_fqdn_prefix: string | null
  dns_zone_name: string | null
  fs_admin_password?: string | null
  selected_project: string | null
  has_keys?: boolean
}

export interface FirewallRule {
  name: string
  direction: string
  priority: number
  source_ranges: string[]
  target_tags: string[]
  allowed: Array<{ IPProtocol: string; ports?: string[] }>
  disabled: boolean
}

export interface FirewallAcl {
  ips: string[]
}

export interface GlobalAccess {
  enabled: boolean
}

export interface ImageInfo {
  name: string
  creation_timestamp: string | null
  status: string
  disk_size_gb: number | null
  family: string | null
  description: string | null
}

export interface Config {
  name: string
  content: string
  description?: string
}

export interface JobStatus {
  job_id: string
  status: 'pending' | 'running' | 'done' | 'error'
  message?: string
}

export type PublicIpsResponse = Array<{
  name: string
  ip: string
}>
