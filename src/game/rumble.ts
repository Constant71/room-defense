/**
 * Controller rumble (Gamepad API "dual-rumble"). Silently does nothing on
 * controllers or browsers that don't support it.
 */
type Actuator = {
  playEffect?: (
    type: string,
    params: { duration: number; strongMagnitude: number; weakMagnitude: number },
  ) => Promise<unknown>;
};

export function rumble(padIndex: number | null, strong: number, weak: number, ms: number): void {
  if (padIndex === null || !navigator.getGamepads) return;
  const pad = navigator.getGamepads()[padIndex] as
    (Gamepad & { vibrationActuator?: Actuator }) | null;
  const act = pad?.vibrationActuator;
  if (!act?.playEffect) return;
  act
    .playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
    .catch(() => {});
}
