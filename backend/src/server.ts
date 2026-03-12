import "dotenv/config";

import { app } from "./app.ts";
import { port } from "./shared/config/app-config.ts";

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
