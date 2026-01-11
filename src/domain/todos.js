export const TODO_STATES = ["new", "ready", "in_progress", "done"];
export const TODO_PRIORITIES = ["rock", "pebble", "sand"];
export const ALLOWED_STATE_TRANSITIONS = {
    new: ["ready"],
    ready: ["in_progress", "done"],
    in_progress: ["done"],
    done: ["ready"],
};
export function normalizePriority(input) {
    const value = input.toLowerCase();
    if (TODO_PRIORITIES.includes(value)) {
        return value;
    }
    return "sand";
}
export function normalizeState(input) {
    const value = input.toLowerCase();
    if (TODO_STATES.includes(value)) {
        return value;
    }
    return "ready";
}
export function isAllowedTransition(current, next) {
    return ALLOWED_STATE_TRANSITIONS[current]?.includes(next) ?? false;
}
export function formatStateLabel(state) {
    if (state === "in_progress")
        return "In Progress";
    return state.charAt(0).toUpperCase() + state.slice(1);
}
export function formatPriorityLabel(priority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
}
