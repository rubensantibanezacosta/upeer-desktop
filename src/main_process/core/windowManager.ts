import { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getAllWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows();
}

export function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}