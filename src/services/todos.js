import { addTodo, addTodoFull, deleteTodo, getLatestSummaries, listScheduledTodos, listTodos, listUnscheduledTodos, transitionTodo, updateTodo, upsertSummary, } from "../db";
import { isAllowedTransition, normalizePriority, normalizeState, TODO_PRIORITIES, TODO_STATES } from "../domain/todos";
import { formatLocalDate } from "../utils/date";
import { normalizeStateInput, validateTaskInput, validateTodoForm, validateTodoTitle } from "../validation";
export const TODO_STATE_OPTIONS = TODO_STATES;
export const TODO_PRIORITY_OPTIONS = TODO_PRIORITIES;
export function listOwnerTodos(owner) {
    return listTodos(owner);
}
export function listOwnerScheduled(owner, endDate) {
    return listScheduledTodos(owner, endDate);
}
export function listOwnerUnscheduled(owner) {
    return listUnscheduledTodos(owner);
}
export function createTodoFromForm(owner, form) {
    const fields = validateTodoForm({
        title: form.get("title"),
        description: form.get("description"),
        priority: form.get("priority"),
        state: form.get("state"),
        scheduled_for: form.get("scheduled_for"),
        tags: form.get("tags"),
    });
    if (!fields)
        return null;
    return addTodoFull(owner, fields);
}
export function quickAddTodo(owner, title, tags) {
    const normalizedTitle = validateTodoTitle(title);
    if (!normalizedTitle)
        return null;
    const normalizedTags = tags?.trim() ?? "";
    return addTodo(normalizedTitle, owner, normalizedTags);
}
export function updateTodoFromForm(owner, id, form) {
    const fields = validateTodoForm({
        title: form.get("title"),
        description: form.get("description"),
        priority: form.get("priority"),
        state: form.get("state"),
        scheduled_for: form.get("scheduled_for"),
        tags: form.get("tags"),
    });
    if (!fields)
        return null;
    return updateTodo(id, owner, fields);
}
export function transitionTodoState(owner, id, state) {
    const normalized = normalizeStateInput(state);
    const existing = listTodos(owner).find((todo) => todo.id === id);
    if (!existing)
        return null;
    if (!isAllowedTransition(existing.state, normalized))
        return null;
    return transitionTodo(id, owner, normalized);
}
export function removeTodo(owner, id) {
    return deleteTodo(id, owner);
}
export function createTodosFromTasks(owner, tasks) {
    const created = [];
    const failed = [];
    for (let i = 0; i < tasks.length; i++) {
        const fields = validateTaskInput(tasks[i]);
        if (!fields) {
            failed.push({ index: i, title: tasks[i]?.title, reason: "Missing or invalid title." });
            continue;
        }
        const todo = addTodoFull(owner, fields);
        if (todo)
            created.push(todo);
        else
            failed.push({ index: i, title: fields.title, reason: "Failed to create task." });
    }
    return { created, failed };
}
export function persistSummary(payload) {
    if (!payload.day_ahead && !payload.week_ahead && !payload.suggestions) {
        return null;
    }
    return upsertSummary({
        owner: payload.owner,
        summaryDate: payload.summary_date,
        dayAhead: payload.day_ahead,
        weekAhead: payload.week_ahead,
        suggestions: payload.suggestions,
    });
}
export function latestSummaries(owner, today) {
    const todayString = formatLocalDate(today);
    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    return getLatestSummaries(owner, todayString, formatLocalDate(weekStart), formatLocalDate(weekEnd));
}
export function normalizeSummaryText(value) {
    if (value === null || value === undefined)
        return null;
    const trimmed = String(value).trim();
    if (!trimmed)
        return null;
    return trimmed.slice(0, 10000);
}
function startOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = (day + 6) % 7;
    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);
    return result;
}
function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}
export { normalizePriority, normalizeState };
