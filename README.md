# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

To start the app, in your terminal run:

```bash
npm run start
```

In the output, you'll find options to open the app in:

- [a development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [an Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [an iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Workflows

This project is configured to use [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/) to automate some development and release processes. These commands are set up in [`package.json`](./package.json) and can be run using NPM scripts in your terminal.

### Previews

Run `npm run draft` to [publish a preview update](https://docs.expo.dev/eas/workflows/examples/publish-preview-update/) of your project, which can be viewed in Expo Go or in a development build.

### Development Builds

Run `npm run development-builds` to [create a development build](https://docs.expo.dev/eas/workflows/examples/create-development-builds/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/create-development-builds/#prerequisites) to ensure you have the correct emulator setup on your machine.

### Production Deployments

Run `npm run deploy` to [deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/#prerequisites) to ensure you're set up to submit to the Apple and Google stores.

## Hosting

Expo offers hosting for websites and API functions via EAS Hosting. See the [Getting Started](https://docs.expo.dev/eas/hosting/get-started/) guide to learn more.

## Vercel deployment

This project can be split into two Vercel Hobby projects:

- **Productiv web** with the repository root as the project root.
- **Productiv API** with `backend` as the project root.

### Web project

- `vercel.json` exports the Expo web app to `dist`.
- Set `EXPO_PUBLIC_API_BASE_URL` to your deployed API origin, for example `https://api.productiv.your-domain.com`.
- Add the custom domain or subdomain you want to use, for example `productiv.your-domain.com`.

### API project

- Use `backend` as the Vercel project root so the Express app in `src/app.ts` is deployed directly.
- Set the environment variables from [`backend/.env.example`](./backend/.env.example).
- `WEB_APP_URL` should match the deployed Productiv web origin exactly.
- `GOOGLE_REDIRECT_URI` should point to the deployed callback route on the API domain.
- Use Supabase Postgres for durable assistant data.
- Set `DATABASE_URL` to the Supabase transaction-pooler URL for runtime traffic on Vercel.
- Set `DIRECT_DATABASE_URL` to the direct Postgres connection string for migrations and schema changes.
- Run `npm --prefix backend run db:migrate` after adding the Supabase credentials.
- Run `npm --prefix backend run db:ping` to verify the backend can reach the configured runtime database.

### Supabase setup

1. Create a Supabase project.
2. In the Supabase dashboard, open `Connect` on the project page.
3. Copy the transaction pooler connection string into `DATABASE_URL`.
4. Copy the direct Postgres connection string into `DIRECT_DATABASE_URL`.
5. Copy the project URL, anon key, and service role key into the matching `SUPABASE_*` variables if you want future access to Supabase APIs beyond raw Postgres.
6. Keep `DATABASE_SSL_MODE=require` unless you intentionally switch to a trusted local Postgres instance.
7. Run `npm --prefix backend run db:migrate` to create the assistant tables.
8. Run `npm --prefix backend run db:ping` to confirm the backend can connect.

### Auth model

- Web requests use an encrypted `httpOnly` session cookie.
- Native redirects can still receive a signed session token through the callback URL for local app state.
- Calendar requests no longer send `authId`; they use either the session cookie or the bearer session token.

## Local-only workflow testing

The project supports a fully local workflow loop that avoids Supabase, Google, and OpenAI:

- Local Postgres runs in Docker and uses the real SQL migrations.
- Local Google mode creates a Productiv test user and stores calendar events in memory.
- Ollama mode sends Productiv prompts to a free local model.
- Deterministic AI mode returns stable fixture-style responses for regression tests.

Start the full local test environment:

```bash
npm run local
```

This starts local Postgres and Ollama, pulls the default model, resets the local database, and starts the web app plus API.

Or run the steps separately:

```bash
npm run local:up
npm run local:ai:pull
```

`local:ai:pull` pulls `qwen3:4b` by default. To use a lighter or stronger model:

```bash
OLLAMA_MODEL=llama3.2:3b npm run local:ai:pull
OLLAMA_MODEL=qwen3:8b npm run local:ai:pull
```

Reset the local database and apply migrations:

```bash
npm run local:reset
```

Run the app and API locally:

```bash
npm run dev:local
```

The backend defaults in this mode are:

```bash
DATABASE_URL=postgresql://productiv:productiv@localhost:54329/productiv_local
DIRECT_DATABASE_URL=postgresql://productiv:productiv@localhost:54329/productiv_local
DATABASE_SSL_MODE=disable
GOOGLE_INTEGRATION_PROVIDER=local
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

If native Ollama is faster on your Mac, run Ollama outside Docker and keep `OLLAMA_BASE_URL=http://localhost:11434`; the backend does not care whether Ollama is Dockerized or native.

Run local regression tests with deterministic AI:

```bash
npm run test:local
```

`local:reset` refuses to run against non-local hosts and refuses database names outside `productiv_local*` or `productiv_test*`.


## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
