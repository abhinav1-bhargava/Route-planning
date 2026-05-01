// Shared worker-colour palette used by the map polylines, the worker
// card left borders, and any other UI that needs to visually link a worker
// to their route. HSL-even spacing keeps the ten workers distinct at a glance.
export function workerColor(workerId: string): string {
  const m = workerId.match(/^W(\d+)$/);
  const n = m ? parseInt(m[1], 10) : 0;
  const hue = ((n - 1) * 36) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}
