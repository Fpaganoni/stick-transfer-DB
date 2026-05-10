const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Attempting to create a test club...");
    const club = await prisma.club.create({
      data: {
        name: "Test Club " + Date.now(),
        city: "Test City",
        country: "Test Country",
      }
    });
    console.log("Success:", club);
  } catch (error) {
    console.error("Error details:", JSON.stringify(error, null, 2));
    console.error("Full error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
