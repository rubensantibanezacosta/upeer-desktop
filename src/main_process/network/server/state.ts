import net from 'node:net';
import { BrowserWindow } from 'electron';
import { KademliaDHT } from '../dht/kademlia/index.js';

export interface IPFailState {
    failures: number;
    blockedUntil: number; // timestamp ms
}

// TCP server state
export let tcpServer: net.Server | null = null;
export let mainWindow: BrowserWindow | null = null;
export let kademliaDHT: KademliaDHT | null = null;
export let dhtMaintenanceTimer: ReturnType<typeof setInterval> | null = null;

// Circuit breaker state
export const ipFailMap = new Map<string, IPFailState>();

// Ready gate state
export let networkReady = false;
export const sendQueue: Array<{ ip: string; framedBuf: Buffer }> = [];

// Getters and setters for encapsulated state
export function setMainWindow(win: BrowserWindow | null) {
    mainWindow = win;
}

export function getMainWindow() {
    return mainWindow;
}

export function setTcpServer(server: net.Server | null) {
    tcpServer = server;
}

export function getTcpServer() {
    return tcpServer;
}

export function setKademliaDHT(dht: KademliaDHT | null) {
    kademliaDHT = dht;
}

export function getKademliaDHT() {
    return kademliaDHT;
}

export function setDhtMaintenanceTimer(timer: ReturnType<typeof setInterval> | null) {
    dhtMaintenanceTimer = timer;
}

export function getDhtMaintenanceTimer() {
    return dhtMaintenanceTimer;
}

export function setNetworkReady(ready: boolean) {
    networkReady = ready;
}

export function getNetworkReady() {
    return networkReady;
}

export function getSendQueue() {
    return sendQueue;
}

export function clearSendQueue() {
    sendQueue.length = 0;
}

export function addToSendQueue(item: { ip: string; framedBuf: Buffer }) {
    sendQueue.push(item);
}

export function drainSendQueue() {
    return sendQueue.splice(0);
}