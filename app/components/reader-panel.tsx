import { useState } from "react";
import { Check, ListTodo, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { Language } from "@/data/digest-types";
import type { Todo } from "@/lib/reader-store";

const copy = {
  hu: {
    progress: "Heti haladás",
    syncing: "SZINKRON…",
    synced: "SZINKRONBAN",
    todo: "Személyes To-do",
    placeholder: "Mit olvassak el később?",
    add: "Hozzáadás",
    delete: "Törlés",
    empty: "(づ ◕‿◕ )づ Még üres. Írj be egy teendőt fent, vagy egy hír „+ teendő” gombjával tedd ide.",
    invite: "CSAK MEGHÍVÓVAL",
    daily: "NAPI FUTÁS · 05:00 UTC",
    freeze: "HETI ZÁRÁS · VAS 24:00",
  },
  en: {
    progress: "Weekly progress",
    syncing: "SYNC…",
    synced: "SYNCED",
    todo: "Personal to-do",
    placeholder: "What should I read later?",
    add: "Add",
    delete: "Delete",
    empty: "(づ ◕‿◕ )づ Nothing yet. Type one above, or use + to-do on a story.",
    invite: "INVITE-ONLY PROFILES",
    daily: "DAILY RUN · 05:00 UTC",
    freeze: "WEEKLY FREEZE · SUN 24:00",
  },
};

/** Weekly progress and the personal to-do list: the 2xl side column, and the header Sheet below 2xl. */
export function ReaderPanel({ language, progress, readCount, total, syncing, todos, onAdd, onToggle, onDelete }: {
  language: Language;
  progress: number;
  readCount: number;
  total: number;
  syncing: boolean;
  todos: Todo[];
  /** False when nothing was added (blank text): the input keeps what was typed. */
  onAdd: (text: string) => boolean;
  onToggle: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [text, setText] = useState("");
  const t = copy[language];
  const openTodos = todos.filter((item) => !item.done).length;
  const add = () => {
    if (onAdd(text)) setText("");
  };

  return (
    <>
      <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_var(--ink)]">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-[0.14em]">{t.progress}</p>
          <span className="font-display text-3xl text-signal">{progress}%</span>
        </div>
        <Progress value={progress} aria-label={t.progress} className="mt-4 h-3 rounded-none bg-ink/15 [&_[data-slot=progress-indicator]]:bg-signal" />
        <p className="mt-3 font-mono text-[11px] text-ink/55">
          {readCount} / {total} · {syncing ? t.syncing : t.synced}
        </p>
      </section>

      <section className="mt-7">
        <div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="size-5 text-signal" />
            <h2 className="font-display text-2xl">{t.todo}</h2>
          </div>
          <span className="font-mono text-xs">{openTodos}</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
            placeholder={t.placeholder}
            aria-label={t.todo}
            className="min-h-10 flex-1 border-2 border-ink bg-paper focus-visible:border-signal"
          />
          <Button size="icon-lg" variant="signal" onClick={add} aria-label={t.add}>
            <Plus />
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {todos.map((item) => (
            <li key={item.id} className={`flex items-center gap-2 border border-ink/25 bg-paper/60 pl-3 ${item.id < 0 ? "opacity-60" : ""}`}>
              {/* The label is the 40px target; the 16px checkbox alone would be too small. */}
              <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={item.done}
                  disabled={item.id < 0}
                  onCheckedChange={(checked) => onToggle(item.id, checked === true)}
                  className="border-ink data-[state=checked]:bg-ink"
                />
                <span className={`min-w-0 flex-1 text-sm leading-5 [overflow-wrap:anywhere] ${item.done ? "text-ink/40 line-through" : ""}`}>
                  {item.text}
                </span>
              </label>
              <Button
                variant="ghost"
                size="icon-lg"
                disabled={item.id < 0}
                onClick={(event) => {
                  // A double click's second click lands on the next row's button, which slides up under the pointer.
                  if (event.detail <= 1) onDelete(item.id);
                }}
                aria-label={t.delete}
                className="size-10 hover:bg-signal/20 sm:size-8"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
          {!todos.length && <li className="py-7 text-center font-mono text-xs leading-5 text-ink/55">{t.empty}</li>}
        </ul>
      </section>

      <section className="mt-8 border-t-2 border-ink pt-5 font-mono text-[11px] leading-5 text-ink/55">
        <p className="flex items-center gap-2 text-signal">
          <Check className="size-3" /> {t.invite}
        </p>
        <p>{t.daily}</p>
        <p>{t.freeze}</p>
      </section>
    </>
  );
}
