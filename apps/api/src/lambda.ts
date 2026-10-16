import { configure } from "@codegenie/serverless-express";
import { app } from "./app.js";

export const handler = configure({ app });
