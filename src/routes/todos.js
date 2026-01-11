import { redirect, unauthorized } from "../http";
import { quickAddTodo, removeTodo, transitionTodoState, updateTodoFromForm } from "../services/todos";
import { normalizeStateInput } from "../validation";
export async function handleTodoCreate(req, session) {
    if (!session)
        return unauthorized();
    const form = await req.formData();
    const title = String(form.get("title") ?? "");
    const tags = String(form.get("tags") ?? "");
    quickAddTodo(session.npub, title, tags);
    return redirect("/");
}
export async function handleTodoUpdate(req, session, id) {
    if (!session)
        return unauthorized();
    const form = await req.formData();
    updateTodoFromForm(session.npub, id, form);
    return redirect("/");
}
export async function handleTodoState(req, session, id) {
    if (!session)
        return unauthorized();
    const form = await req.formData();
    const nextState = normalizeStateInput(String(form.get("state") ?? "ready"));
    transitionTodoState(session.npub, id, nextState);
    return redirect("/");
}
export function handleTodoDelete(session, id) {
    if (!session)
        return unauthorized();
    removeTodo(session.npub, id);
    return redirect("/");
}
