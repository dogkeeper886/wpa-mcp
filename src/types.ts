// WiFi Types
export interface Network {
  bssid: string;
  frequency: number;
  signal: number;
  flags: string;
  ssid: string;
}

export interface SavedNetwork {
  networkId: number;
  ssid: string;
  bssid: string;
  flags: string;
}

export interface ConnectionStatus {
  wpaState: string;
  ssid?: string;
  bssid?: string;
  ipAddress?: string;
  frequency?: number;
  keyManagement?: string;
  address?: string; // Current MAC address
}

// MAC Address Randomization Types
export type MacAddressMode =
  | 'device'            // Use real device MAC (wpa_supplicant value: 0)
  | 'random'            // New random MAC each connection (wpa_supplicant value: 1)
  | 'persistent-random' // Same random MAC across reboots (wpa_supplicant value: 2)
  | 'specific';         // User-provided MAC address

export type PreassocMacMode =
  | 'disabled'          // Use real MAC during scan (wpa_supplicant value: 0)
  | 'random'            // Random MAC during scan (wpa_supplicant value: 1)
  | 'persistent-random';// Persistent random during scan (wpa_supplicant value: 2)

export interface MacAddressConfig {
  mode: MacAddressMode;
  address?: string;            // Required only when mode is 'specific'
  preassocMode?: PreassocMacMode;
  randAddrLifetime?: number;   // Seconds before rotating random MAC (default: 60)
}

// Connectivity Types
export interface PingResult {
  host: string;
  alive: boolean;
  time?: number;
  output: string;
}

export interface DnsResult {
  hostname: string;
  addresses: string[];
}

// Browser Types
export interface ScriptInfo {
  name: string;
  path: string;
}

export interface ScriptVariables {
  [key: string]: string;
}
