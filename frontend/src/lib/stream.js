// frontend/src/lib/stream.js
export class StreamClient {
  constructor(sessionId) {
    this.ws = null;
    this.sessionId = sessionId;
    this.onTrackingResult = null;
  }

  connect() {
    const wsUrl = `ws://localhost:8000/api/ws/stream/${this.sessionId}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'tracking_result' && this.onTrackingResult) {
        this.onTrackingResult(data);
      }
    };
  }

  setZone(points, zoneType = 'polygon') {
    this.ws.send(JSON.stringify({
      type: 'set_zone',
      points,
      zone_type: zoneType
    }));
  }

  sendFrame(frameData, frameNumber) {
    this.ws.send(JSON.stringify({
      type: 'frame',
      frame_data: frameData,
      frame_number: frameNumber
    }));
  }
}