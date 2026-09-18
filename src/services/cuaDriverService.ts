import { invoke } from '@tauri-apps/api/core';

let ready = false;

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function start(): Promise<void> {
  if (ready || !isTauriEnv()) return;
  try {
    await invoke('cua_start');
    ready = true;
    console.log('[cuaDriver] MCP process ready (Rust)');
  } catch (e: any) {
    console.warn('[cuaDriver] start failed:', e);
    ready = false;
  }
}

export async function stop(): Promise<void> {
  if (!isTauriEnv()) return;
  try { await invoke('cua_stop'); } catch {}
  ready = false;
}

export function isReady(): boolean {
  return ready;
}

export async function click(pid: number, x: number, y: number, button?: 'left' | 'right' | 'double'): Promise<any> {
  return invoke('cua_click', { pid, x: Math.round(x), y: Math.round(y), button: button || 'left' });
}

export async function typeText(pid: number, text: string): Promise<any> {
  return invoke('cua_type_text', { pid, text });
}

export async function pressKey(pid: number, key: string): Promise<any> {
  return invoke('cua_press_key', { pid, key });
}

export async function hotkey(pid: number, keys: string[]): Promise<any> {
  return invoke('cua_hotkey', { pid, keys });
}

export async function scroll(pid: number, x: number, y: number, direction: 'up' | 'down', distance: number): Promise<any> {
  return invoke('cua_scroll', { pid, x: Math.round(x), y: Math.round(y), direction, amount: Math.round(distance) });
}

export async function drag(pid: number, fromX: number, fromY: number, toX: number, toY: number): Promise<any> {
  return invoke('cua_drag', { pid, fromX: Math.round(fromX), fromY: Math.round(fromY), toX: Math.round(toX), toY: Math.round(toY) });
}

export const cuaDriver = {
  start,
  stop,
  isReady,
  click,
  typeText,
  pressKey,
  hotkey,
  scroll,
  drag,
};
