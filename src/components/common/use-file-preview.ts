"use client";

import { useEffect, useState } from "react";

/** Shows a chosen file as a blob URL and frees it when replaced or unmounted. */
export function useFilePreview(currentUrl: string | null) {
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function showFile(file: File | undefined) {
    setPreview(file ? URL.createObjectURL(file) : currentUrl);
  }

  return { preview, showFile };
}
