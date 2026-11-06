export class DrivingEventTimeline {
  constructor({ limit = 500 } = {}) {
    this.limit = limit;
    this.reset();
  }

  append(event, context = {}) {
    if (!event?.eventId || this.ids.has(event.eventId)) return false;
    this.ids.add(event.eventId);
    this.items.push(Object.freeze({
      ...event,
      dmsState: context.dmsState || event.payload?.state || "UNKNOWN",
      roadEvent: context.roadEvent || event.eventType,
      adasDecision: context.adasDecision || "UNKNOWN",
      vehicleResponse: context.vehicleResponse || "NONE",
    }));
    if (this.items.length > this.limit) {
      const removed = this.items.splice(0, this.items.length - this.limit);
      removed.forEach((item) => this.ids.delete(item.eventId));
    }
    return true;
  }

  list() {
    return [...this.items];
  }

  reset() {
    this.items = [];
    this.ids = new Set();
  }
}
