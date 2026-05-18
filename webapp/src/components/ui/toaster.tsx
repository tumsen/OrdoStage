import { useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const hideViewport =
    isMobile &&
    location.pathname === "/time" &&
    !toasts.some((t) => t.open && t.variant === "destructive");

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport className={cn(hideViewport && "hidden pointer-events-none")} />
    </ToastProvider>
  );
}
