"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadUrl } from "@/lib/uploads";
import { useFilePreview } from "./use-file-preview";

type Props = { name: string; label: string; currentPath?: string | null; errors?: string[] };

export function ImageField({ name, label, currentPath, errors }: Props) {
  const { preview, showFile } = useFilePreview(currentPath ? uploadUrl(currentPath, { thumb: true }) : null);
  const errorId = `${name}-error`;

  return (
    <div className="flex items-center gap-3">
      <div className="size-16 shrink-0 overflow-hidden rounded-md border border-dashed bg-secondary">
        {preview && <img src={preview} alt="" className="size-full object-cover" />}
      </div>
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={errors ? true : undefined}
          aria-describedby={errors ? errorId : undefined}
          onChange={(event) => showFile(event.currentTarget.files?.[0])}
        />
        {errors && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {errors[0]}
          </p>
        )}
      </div>
    </div>
  );
}
