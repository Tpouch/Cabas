"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { FieldError } from "./field-error";

export type ComboboxOption = { id: string; label: string; imageUrl?: string | null };

type Props = {
  id: string;
  name: string;
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (id: string) => void;
  onCreate?: (query: string) => void;
  placeholder: string;
  errors?: string[];
};

export function EntityCombobox({ id, name, label, options, value, onChange, onCreate, placeholder, errors }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.id === value);
  const trimmed = query.trim();
  const exactMatch = options.some(
    (option) => option.label.toLocaleLowerCase("fr-FR") === trimmed.toLocaleLowerCase("fr-FR"),
  );

  function choose(optionId: string) {
    onChange(optionId);
    setOpen(false);
  }

  function create() {
    onCreate?.(trimmed);
    setOpen(false);
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value ?? ""} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={errors ? true : undefined}
            aria-describedby={errors ? `${id}-error` : undefined}
            className="h-11 w-full justify-between bg-card px-3 text-base font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher…" value={query} onValueChange={setQuery} className="text-base" />
            <CommandList>
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.label} onSelect={() => choose(option.id)} className="min-h-11">
                    {option.imageUrl && <img src={option.imageUrl} alt="" className="size-6 rounded-sm object-cover" />}
                    <span className="flex-1">{option.label}</span>
                    {option.id === value && <Check className="size-4" aria-hidden />}
                  </CommandItem>
                ))}
              </CommandGroup>
              {onCreate && trimmed && !exactMatch && (
                // cmdk hides groups without matching items: force this one so "Créer" is always offered.
                <CommandGroup forceMount>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    forceMount
                    onSelect={create}
                    className="min-h-11 font-semibold text-primary"
                  >
                    <Plus className="size-4" aria-hidden />
                    {`Créer « ${trimmed} »`}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <FieldError id={`${id}-error`} errors={errors} />
    </div>
  );
}
