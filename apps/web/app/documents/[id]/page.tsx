import { DocViewer } from "@/components/DocViewer";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <DocViewer id={id} />
    </div>
  );
}
