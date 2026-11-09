/** Temporary body for a screen that is registered but not built yet. */
import { ConstructionIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function ScreenPlaceholder({ id, title }: { id: string; title: string }) {
  return (
    <Page>
      <PageHeader title={title} screen={id} />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ConstructionIcon />
          </EmptyMedia>
          <EmptyTitle>{title} is being built</EmptyTitle>
          <EmptyDescription>Screen {id} from the App Flow.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
