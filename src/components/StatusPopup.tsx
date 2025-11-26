import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusPopupProps {
    isOpen: boolean;
    onClose: () => void;
    status: "success" | "error";
    title: string;
    message: string;
    actionLabel?: string;
}

export function StatusPopup({
    isOpen,
    onClose,
    status,
    title,
    message,
    actionLabel,
}: StatusPopupProps) {
    const isSuccess = status === "success";

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none shadow-xl">
                <div className="flex flex-col items-center p-10 text-center bg-white">
                    {/* Icon Circle */}
                    <div
                        className={cn(
                            "flex items-center justify-center w-20 h-20 rounded-full mb-6 border-4",
                            isSuccess
                                ? "border-blue-100 bg-blue-50"
                                : "border-red-100 bg-red-50"
                        )}
                    >
                        {isSuccess ? (
                            <Check className="w-10 h-10 text-blue-500" strokeWidth={3} />
                        ) : (
                            <X className="w-10 h-10 text-red-500" strokeWidth={3} />
                        )}
                    </div>

                    <DialogHeader className="mb-2 w-full">
                        <DialogTitle
                            className={cn(
                                "text-2xl font-bold text-center",
                                isSuccess ? "text-blue-500" : "text-red-500"
                            )}
                        >
                            {title}
                        </DialogTitle>
                    </DialogHeader>

                    <DialogDescription className="text-center text-gray-500 mb-8 text-base">
                        {message}
                    </DialogDescription>

                    <DialogFooter className="w-full sm:justify-center">
                        <Button
                            onClick={onClose}
                            className={cn(
                                "w-full max-w-[200px] h-11 text-base font-medium transition-all duration-200",
                                isSuccess
                                    ? "bg-blue-500 hover:bg-blue-600 text-white shadow-blue-200 shadow-lg"
                                    : "bg-red-500 hover:bg-red-600 text-white shadow-red-200 shadow-lg"
                            )}
                        >
                            {actionLabel || (isSuccess ? "Continue" : "Try Again")}
                        </Button>
                    </DialogFooter>
                </div>

                {/* Decorative bottom wave (CSS based approximation) */}
                <div
                    className={cn(
                        "h-3 w-full opacity-20",
                        isSuccess ? "bg-blue-500" : "bg-red-500"
                    )}
                />
            </DialogContent>
        </Dialog>
    );
}
