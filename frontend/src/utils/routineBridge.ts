const ROUTINE_BRIDGE_KEY = 'gymesis:bridge:selectedRoutineId:v1'
const ROUTINE_NAME_KEY = 'gymesis:bridge:selectedRoutineName:v1'

export function setRoutineBridge(routineId: string, routineName?: string) {
  localStorage.setItem(ROUTINE_BRIDGE_KEY, routineId)
  if (routineName) {
    localStorage.setItem(ROUTINE_NAME_KEY, routineName)
  }
}

export function getRoutineBridge() {
  return {
    routineId: localStorage.getItem(ROUTINE_BRIDGE_KEY) || '',
    routineName: localStorage.getItem(ROUTINE_NAME_KEY) || '',
  }
}

export function clearRoutineBridge() {
  localStorage.removeItem(ROUTINE_BRIDGE_KEY)
  localStorage.removeItem(ROUTINE_NAME_KEY)
}
