"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Takes no arguments: talks to the same-origin /api/auth/* handler.
export const authClient = createAuthClient();
