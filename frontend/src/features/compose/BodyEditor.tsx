import { TextAlign } from "@tiptap/extension-text-align";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/cn";

interface BodyEditorProps {
  id: string;
  onChange: (html: string) => void; // "" when the editor is empty
  invalid?: boolean;
  describedBy?: string;
}

// TipTap rich-text editor. It produces clean HTML that only uses tags the
// backend's sanitizer allows (code blocks are turned off for that reason).
export function BodyEditor({ id, onChange, invalid, describedBy }: BodyEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [2] }, link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Type Your Reply..." }),
    ],
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Email body",
        ...(invalid && { "aria-invalid": "true" }),
        ...(describedBy && { "aria-describedby": describedBy }),
        class: "rich-text min-h-[320px] px-4 py-3 text-sm text-gray-900",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  return (
    <div className={cn("rounded-xl bg-[#FAFAFA] p-3", invalid && "ring-1 ring-red-400")}>
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

const ALIGNMENTS = ["left", "center", "right"] as const;
const ALIGN_ICONS: Record<(typeof ALIGNMENTS)[number], LucideIcon> = { left: AlignLeft, center: AlignCenter, right: AlignRight };

function Toolbar({ editor }: { editor: Editor }) {
  // TipTap doesn't re-render React on every keystroke. useEditorState
  // subscribes to just these values, so the buttons' active states stay
  // correct without re-rendering the whole page.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      heading: e.isActive("heading", { level: 2 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      ordered: e.isActive("orderedList"),
      bullet: e.isActive("bulletList"),
      quote: e.isActive("blockquote"),
      align: ALIGNMENTS.find((a) => e.isActive({ textAlign: a })) ?? "left",
      canIndent: e.can().sinkListItem("listItem"),
      canOutdent: e.can().liftListItem("listItem"),
    }),
  });

  const run = () => editor.chain().focus();
  const nextAlign = ALIGNMENTS[(ALIGNMENTS.indexOf(s.align) + 1) % ALIGNMENTS.length];

  return (
    <div role="toolbar" aria-label="Formatting" className="mb-1 flex h-9 flex-wrap items-center gap-0.5 rounded-full bg-white px-2">
      <Tool icon={Undo2} label="Undo" disabled={!s.canUndo} onClick={() => run().undo().run()} />
      <Tool icon={Redo2} label="Redo" disabled={!s.canRedo} onClick={() => run().redo().run()} />
      <Divider />
      <Tool icon={Type} label="Large text" active={s.heading} onClick={() => run().toggleHeading({ level: 2 }).run()} />
      <Divider />
      <Tool icon={Bold} label="Bold" active={s.bold} onClick={() => run().toggleBold().run()} />
      <Tool icon={Italic} label="Italic" active={s.italic} onClick={() => run().toggleItalic().run()} />
      <Tool icon={Underline} label="Underline" active={s.underline} onClick={() => run().toggleUnderline().run()} />
      <Divider />
      <Tool icon={ALIGN_ICONS[s.align]} label={`Align: ${s.align} (click for ${nextAlign})`} onClick={() => run().setTextAlign(nextAlign).run()} />
      <Divider />
      <Tool icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => run().toggleOrderedList().run()} />
      <Tool icon={List} label="Bulleted list" active={s.bullet} onClick={() => run().toggleBulletList().run()} />
      <Tool icon={IndentIncrease} label="Indent" disabled={!s.canIndent} onClick={() => run().sinkListItem("listItem").run()} />
      <Tool icon={IndentDecrease} label="Outdent" disabled={!s.canOutdent} onClick={() => run().liftListItem("listItem").run()} />
      <Tool icon={Quote} label="Quote" active={s.quote} onClick={() => run().toggleBlockquote().run()} />
      <Divider />
      <Tool icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => run().toggleStrike().run()} />
    </div>
  );
}

interface ToolProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function Tool({ icon: Icon, label, onClick, active, disabled }: ToolProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900",
        "focus-visible:outline-2 focus-visible:outline-green-600 disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-brand-50 text-green-700",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-gray-200" />;
}
