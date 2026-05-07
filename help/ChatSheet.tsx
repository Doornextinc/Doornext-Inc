import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle } from "lucide-react";
import { ChatView } from "./ChatView";
import { useChat } from "@/hooks/useChat";

interface ChatSheetProps {
  orderId: string;
  recipientId: string;
  recipientName: string;
  senderRole: "driver" | "customer";
  recipientAvatar?: string | null;
}

/**
 * A button that opens a bottom sheet with the full ChatView.
 * Drop-in replacement for the old OrderChat component.
 */
export function ChatSheet({
  orderId,
  recipientId,
  recipientName,
  senderRole,
  recipientAvatar,
}: ChatSheetProps) {
  const [open, setOpen] = useState(false);
  const { unreadCount } = useChat({ orderId, recipientId, senderRole });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <MessageCircle className="h-4 w-4 mr-1" />
          Chat
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[75vh] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            Chat with {recipientName}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-4 pb-4">
          <ChatView
            orderId={orderId}
            recipientId={recipientId}
            recipientName={recipientName}
            senderRole={senderRole}
            recipientAvatar={recipientAvatar}
            compact
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
