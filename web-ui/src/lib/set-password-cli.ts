import { changePassword } from "./auth-file.server.ts";

/**
 * The hashing and the file format live in `auth-file.server.ts`, the same
 * module the running app reads, so the two can never drift. This file is only
 * the plumbing: read the password from stdin -- never argv, where it would show
 * up in `ps` -- and report what happened.
 *
 * Invoked by `scripts/set_web_ui_password.sh`, which owns the prompt.
 */
function readPasswordFromStdin() {
	return new Promise<string>((resolve, reject) => {
		if (process.stdin.isTTY) {
			// Nothing is piping a password in, and prompting is the shell script's
			// job. Without this the process would sit here forever.
			reject(
				new Error(
					"No password on stdin. Run scripts/set_web_ui_password.sh instead.",
				),
			);
			return;
		}
		let buffer = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			buffer += chunk;
		});
		// Only the single trailing newline the shell adds is stripped; a password
		// is otherwise taken exactly as given, spaces and all.
		process.stdin.on("end", () => resolve(buffer.replace(/\r?\n$/, "")));
		process.stdin.on("error", reject);
	});
}

try {
	await changePassword(await readPasswordFromStdin());
	console.log("Password updated. All devices have been signed out.");
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}
