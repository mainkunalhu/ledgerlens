"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { colorFor } from "@/lib/boxes";
import type { DocumentDetail } from "@/lib/types";

export function FieldsPanel({
  doc,
  onSelect,
}: {
  doc: DocumentDetail;
  onSelect: (key: string | null) => void;
}) {
  const [tab, setTab] = useState("fields");
  const items =
    (doc.vision_json?.line_items as
      | { desc?: string; qty?: number; rate?: number; amount?: number }[]
      | undefined) ?? [];

  return (
    <Card className="flex h-full min-h-100 flex-col">
      <CardHeader>
        <CardTitle>Extracted data</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="w-full">
            <TabsTrigger value="fields">
              Fields ({doc.fields.length})
            </TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="fields" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="pr-4">
                <Table>
                  <TableBody>
                    {doc.fields.map((f, i) => (
                      <TableRow key={f.id ?? `${f.key}-${f.value}`}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => onSelect(f.bbox ? f.key : null)}
                            className="flex items-center gap-2 text-left"
                          >
                            <span
                              className="inline-block size-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: colorFor(f.key, i) }}
                            />
                            <span className="font-mono text-xs text-zinc-400">
                              {f.key}
                            </span>
                          </button>
                          <div className="mt-1 text-sm font-medium">
                            {f.value}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Progress value={Math.round(f.confidence * 100)} />
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-zinc-500">
                              {Math.round(f.confidence * 100)}%
                            </span>
                            <Badge variant="outline">{f.source}</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {items.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                      Line items ({items.length})
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Desc</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Amt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((li) => (
                          <TableRow
                            key={`${li.desc}-${li.qty}-${li.rate}-${li.amount}`}
                          >
                            <TableCell>{li.desc}</TableCell>
                            <TableCell>{li.qty}</TableCell>
                            <TableCell>{li.rate}</TableCell>
                            <TableCell>{li.amount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {doc.fused_json && (
                  <p className="text-muted-foreground mt-3 font-mono text-xs">
                    OCR support rate:{" "}
                    {Math.round((doc.fused_json.ocr_support_rate ?? 0) * 100)}%
                    {" · "}layout: {doc.fused_json.layout?.method ?? "—"}
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="json" className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <pre className="pr-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(doc.vision_json, null, 2)}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
