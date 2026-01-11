import { normalizePriority, normalizeState, TODO_PRIORITIES, TODO_STATES } from "./domain/todos";
export const MAX_TITLE_LENGTH = 500;
export const MAX_TASKS_PER_REQUEST = 50;
export function isValidDateString(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00`);
    return !Number.isNaN(parsed.valueOf());
}
export function validateTodoTitle(title) {
    const trimmed = title.trim().slice(0, MAX_TITLE_LENGTH);
    return trimmed.length > 0 ? trimmed : null;
}
export function normalizeOptionalText(value, max = 10000) {
    if (value === null || value === undefined)
        return null;
    const trimmed = String(value).trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, max);
}
export function normalizeStateInput(input) {
    return normalizeState(input);
}
export function normalizePriorityInput(input) {
    return normalizePriority(input);
}
export function validateTodoForm(fields) {
    const title = validateTodoTitle(String(fields.title ?? ""));
    if (!title)
        return null;
    const description = String(fields.description ?? "").trim();
    const priority = normalizePriorityInput(String(fields.priority ?? "sand"));
    const state = normalizeStateInput(String(fields.state ?? "ready"));
    const scheduledRaw = String(fields.scheduled_for ?? "").trim();
    const scheduled_for = scheduledRaw && isValidDateString(scheduledRaw) ? scheduledRaw : null;
    const tags = String(fields.tags ?? "").trim();
    return { title, description, priority, state, scheduled_for, tags };
}
export function validateTaskInput(task) {
    const title = task.title ? validateTodoTitle(task.title) : null;
    if (!title)
        return null;
    const description = task.description?.trim() ?? "";
    const priority = normalizePriorityInput(task.priority ?? "sand");
    const state = normalizeStateInput(task.state ?? "new");
    const scheduled_for = task.scheduled_for && isValidDateString(task.scheduled_for) ? task.scheduled_for : null;
    const tags = task.tags?.trim() ?? "";
    return { title, description, priority, state, scheduled_for, tags };
}
export function validateLoginMethod(method) {
    return method === "ephemeral" || method === "extension" || method === "bunker" || method === "secret";
}
export function validateTodoState(state) {
    return TODO_STATES.includes(state);
}
export function validateTodoPriority(priority) {
    return TODO_PRIORITIES.includes(priority);
}
