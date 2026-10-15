const ACTIVE_WINDOW_MS = 1_800;
const STILL_FRAME_INTERVAL_MS = 3_000;
const MAX_ACTIVE_SPEAKERS = 3;

type SpeakerActivity = { active: boolean; lastSpokeAt: number };

export class CallFanoutPolicy {
    private speakers = new Map<string, Map<string, SpeakerActivity>>();
    private lastStillFrameAt = new Map<string, number>();

    setSpeakerActive(callId: string, speakerId: string, active: boolean, now = Date.now()): void {
        const speakers = this.speakers.get(callId) ?? new Map<string, SpeakerActivity>();
        speakers.set(speakerId, { active, lastSpokeAt: now });
        this.speakers.set(callId, speakers);
    }

    shouldForwardVideo(callId: string, senderId: string, data: Uint8Array, now = Date.now()): boolean {
        if (data.byteLength < 17) return true;
        if (data[0] === 0) return true;
        if (data[0] !== 1) return data[1] === 1;
        const speakers = this.speakers.get(callId);
        const activeSpeakers = Array.from(speakers?.entries() ?? [])
            .filter(([, activity]) => now - activity.lastSpokeAt <= ACTIVE_WINDOW_MS)
            .sort((left, right) => right[1].lastSpokeAt - left[1].lastSpokeAt)
            .slice(0, MAX_ACTIVE_SPEAKERS);
        if (activeSpeakers.some(([speakerId]) => speakerId === senderId)) {
            speakers?.set(senderId, { active: true, lastSpokeAt: now });
            return true;
        }
        if (data[1] !== 1) return false;
        const key = `${callId}:${senderId}`;
        const lastSentAt = this.lastStillFrameAt.get(key) ?? 0;
        if (now - lastSentAt < STILL_FRAME_INTERVAL_MS) return false;
        this.lastStillFrameAt.set(key, now);
        return true;
    }

    removeCall(callId: string): void {
        this.speakers.delete(callId);
        for (const key of this.lastStillFrameAt.keys()) {
            if (key.startsWith(`${callId}:`)) this.lastStillFrameAt.delete(key);
        }
    }

    clearSpeaker(callId: string, speakerId: string): void {
        this.speakers.get(callId)?.delete(speakerId);
    }
}

export const callFanoutPolicy = new CallFanoutPolicy();