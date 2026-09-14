# Publish MUN Puzzle Board on GitHub Pages

This project is already configured for GitHub Pages.

## What was changed for GitHub Pages

- `vite.config.ts` uses `base: './'`, so the app works both on a user site (`username.github.io`) and a project site (`username.github.io/repository-name/`).
- `.github/workflows/deploy-pages.yml` automatically builds and deploys the app after a push to `main`.
- `public/.nojekyll` prevents GitHub Pages/Jekyll processing from interfering with the generated static files.
- The application itself is unchanged: Puzzle Board, Saved Setups, chairs, topics, awards, drag/drop, calculations, imports/exports and local persistence remain available.

## First publication

1. Create a new GitHub repository. Any repository name works. For example: `mun-puzzle-board`.
2. Upload **all files and folders from this project root**, including the hidden `.github` folder.
3. Make sure your default branch is `main`.
4. In the GitHub repository, open **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **GitHub Actions**.
6. Open the repository's **Actions** tab. The workflow named **Deploy MUN Puzzle Board to GitHub Pages** should run automatically after the files are pushed to `main`.
7. When deployment is complete, go back to **Settings → Pages** and click **Visit site**.

## Updating the website later

Edit the source files, then commit/push to `main`. GitHub Actions will rebuild and redeploy the site automatically.

## Important data note

Competition information and Saved Setups use browser `localStorage`. Data entered on `localhost` does not automatically appear on the GitHub Pages URL because browsers treat them as different sites/origins.

To move existing data from your local version to the published site:

1. Open the local app and use **Export Competition** to save the JSON file.
2. Open the GitHub Pages version.
3. Use **Import Competition** and select that JSON file.

After that, data entered on the GitHub Pages site remains saved in that browser for that published site.

## Optional local production check

```bash
npm install
npm run build
npm run preview
```

The deployable static output is generated in `dist/`.
