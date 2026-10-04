"use client";

import { Camera, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { FieldError } from "@/components/common/field-error";
import { useFilePreview } from "@/components/common/use-file-preview";
import { Button } from "@/components/ui/button";
import { uploadUrl } from "@/lib/uploads";
import { cn } from "@/lib/utils";

type Props = { name: string; currentPath?: string | null; errors?: string[] };

const MAX_BYTES = 10 * 1024 * 1024;

/** File picker that also accepts a dropped photo (desktop). Phones offer camera or gallery. */
export function ReceiptField({ name, currentPath, errors }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { preview, showFile } = useFilePreview(currentPath ? uploadUrl(currentPath, { thumb: true }) : null);
  const shownErrors = localError ? [localError] : errors;

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setHasFile(false);
    showFile(undefined);
  }

  /** Checks the size here so a too-big photo never blocks the whole form on the server. */
  function accept(file: File | undefined) {
    if (file && file.size > MAX_BYTES) {
      clear();
      setLocalError("L'image dépasse 10 Mo.");
      return;
    }
    setLocalError(null);
    setHasFile(Boolean(file));
    showFile(file);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    if (!inputRef.current || files.length === 0) return;
    inputRef.current.files = files;
    accept(files[0]);
  }

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={name}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-28 cursor-pointer items-center gap-3 rounded-md border border-dashed bg-secondary/50 p-3 text-sm text-muted-foreground",
          dragging && "border-primary bg-secondary",
          shownErrors && "border-destructive",
        )}
      >
        {preview ? (
          <img src={preview} alt="Aperçu du ticket" className="h-24 w-16 rounded-sm object-cover" />
        ) : (
          <Camera className="size-6 shrink-0 text-primary" aria-hidden />
        )}
        <span>
          <span className="block font-semibold text-foreground">Photo du ticket</span>
          Glisse la photo du ticket ici, ou touche pour la prendre ou la choisir.
        </span>
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-invalid={shownErrors ? true : undefined}
        aria-describedby={shownErrors ? `${name}-error` : undefined}
        onChange={(event) => accept(event.currentTarget.files?.[0])}
      />
      {hasFile && (
        <Button type="button" variant="ghost" className="h-11 justify-self-start text-muted-foreground" onClick={clear}>
          <X aria-hidden /> Retirer la photo
        </Button>
      )}
      <FieldError id={`${name}-error`} errors={shownErrors} />
    </div>
  );
}
