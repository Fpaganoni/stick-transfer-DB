// Runs before every spec file. Importing @prisma/client loads the developer's real
// .env, so without this a spec would see their actual Cloudinary account. Dotenv
// never overrides a variable that is already set, so this value wins.
process.env.CLOUDINARY_URL = "cloudinary://test-key:test-secret@demo";
