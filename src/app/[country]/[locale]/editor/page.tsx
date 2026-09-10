"use client";

import { Puck } from "@puckeditor/core";
import { config } from "@/puck/config";

export default function EditorPage() {
  return (
    <Puck
      config={config}
      data={{
        content: [],
        root: {},
      }}
    />
  );
}
