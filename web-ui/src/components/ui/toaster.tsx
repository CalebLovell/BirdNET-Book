import {
	AlertTriangle,
	CheckCircle2,
	CircleAlert,
	Info,
	LoaderCircle,
	Trash2,
} from "lucide-react";
import { type ExternalToast, Toaster as Sonner, toast } from "sonner";

export { toast };

/**
 * A destructive action that went through -- detections deleted, lists cleared,
 * every device signed out. It worked, but it took something away, so it wears
 * clay like the button that asked for it rather than success's moss. Sonner has
 * no such type; this is a success toast with the destructive tone laid over it
 * (`.toast-destructive` in styles.css).
 */
export function destructiveToast(message: string, data?: ExternalToast) {
	return toast.success(message, {
		...data,
		icon: <Trash2 className="size-4 text-destructive" />,
		className: "toast-destructive",
	});
}

/**
 * The one place an action reports back once it has finished -- a deletion, a
 * save, a restart. Mounted once in the root document, so a result never has to
 * find room for itself in the layout of the page that caused it.
 *
 * Unstyled sonner, dressed as a `feature-card`: 4px radius, Georgia, a hairline
 * border. Each outcome has its own tone so it reads before the words do: moss
 * for done, sand and bark for done-with-a-catch, clay for failed. Neutral news
 * (info, a save still running) stays on plain white with the `--line` border.
 */
export function Toaster() {
	return (
		<Sonner
			position="top-right"
			swipeDirections={["right"]}
			offset={16}
			mobileOffset={16}
			gap={8}
			visibleToasts={4}
			icons={{
				success: <CheckCircle2 className="size-4 text-[var(--moss)]" />,
				warning: <AlertTriangle className="size-4 text-[var(--bark)]" />,
				error: <CircleAlert className="size-4 text-destructive" />,
				info: <Info className="size-4 text-[var(--moss)]" />,
				loading: (
					<LoaderCircle className="size-4 animate-spin text-muted-foreground" />
				),
			}}
			toastOptions={{
				unstyled: true,
				classNames: {
					toast:
						"feature-card flex w-full items-start gap-2.5 rounded-md p-3 text-sm shadow-[0_6px_20px_-8px_color-mix(in_oklab,var(--ink)_28%,transparent)] *:transition-opacity *:duration-200 data-[expanded=false]:data-[front=false]:*:opacity-0 data-[type=success]:border-[var(--toast-success-line)] data-[type=success]:[background:var(--toast-success-fill)] data-[type=warning]:border-[var(--toast-warning-line)] data-[type=warning]:[background:var(--toast-warning-fill)] data-[type=error]:border-[var(--toast-error-line)] data-[type=error]:[background:var(--toast-error-fill)]",
					icon: "relative mt-px flex size-4 shrink-0 items-center justify-center",
					content: "min-w-0 grow space-y-0.5",
					title:
						"font-medium leading-snug text-foreground in-data-[type=error]:text-destructive in-data-[type=success]:text-[var(--moss)] in-data-[type=warning]:text-[var(--bark)]",
					description: "text-muted-foreground text-xs leading-relaxed",
					actionButton:
						"ml-2 shrink-0 self-center rounded-md bg-[var(--moss)] px-2 py-1 font-medium text-[var(--paper-raised)] text-xs",
				},
			}}
		/>
	);
}
