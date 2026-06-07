import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...\n");

  // Clear existing data (children before parents to satisfy FK constraints)
  console.log("🗑️  Clearing existing data...");
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversationParticipant.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.savedJob.deleteMany(),
    prisma.jobApplication.deleteMany(),
    prisma.jobOpportunity.deleteMany(),
    prisma.follow.deleteMany(),
    prisma.like.deleteMany(),
    prisma.newsArticle.deleteMany(),
    prisma.trajectory.deleteMany(),
    prisma.clubMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.club.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log("✅ Data cleared\n");

  // Hash password for all mock users
  const hashedPassword = await bcrypt.hash("password123", 10);

  // ========== FIELD HOCKEY CLUBS ==========
  console.log("🏑 Creating field hockey clubs...");

  const clubs = await Promise.all([
    // Spanish field hockey clubs
    prisma.club.create({
      data: {
        name: "Club de Campo Villa de Madrid",
        city: "Madrid",
        country: "🇪🇸 España",
        league: "División de Honor",
        foundedYear: 1929,
        description: "One of the most prestigious field hockey clubs in Spain",
        bio: "Excellence in field hockey since 1929",
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/ccvm_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Professional Coaching",
          "International Tours",
          "Full Medical Support",
          "Sponsorship Opportunities",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "RC Polo Barcelona",
        city: "Barcelona",
        country: "🇪🇸 España",
        league: "División de Honor",
        foundedYear: 1897,
        description:
          "Historic Barcelona field hockey club with multiple championships",
        bio: "Tradition and excellence in field hockey",
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/rcpolo_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1517836357463-d25ddfcbf042?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Elite Training Facilities",
          "Gym Access",
          "Player Networking",
          "High Performance Center",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Real Club de Polo",
        city: "Barcelona",
        country: "🇪🇸 España",
        league: "División de Honor",
        foundedYear: 1942,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/realclubpolo_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1536502262293-38cffbe24cbf?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: ["Swimming Pool", "Social Events", "Tennis Courts"],
      },
    }),
    prisma.club.create({
      data: {
        name: "CD Terrassa HC",
        city: "Terrassa",
        country: "🇪🇸 España",
        league: "División de Honor",
        foundedYear: 1952,
        description: "European champion field hockey club",
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/cdterrassa_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1451186580459-32d7a204ebf1?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: ["Youth Academy", "Video Analysis", "Nutrition Planning"],
      },
    }),
    prisma.club.create({
      data: {
        name: "Atlètic Terrassa HC",
        city: "Terrassa",
        country: "🇪🇸 España",
        league: "División de Honor",
        foundedYear: 1952,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/atleticterrassa_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1483389127117-b6a2102724ae?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Indoor Hockey Pitch",
          "Summer Camps",
          "Psychological Support",
        ],
      },
    }),
    // Argentinian field hockey clubs
    prisma.club.create({
      data: {
        name: "Club Atlético San Isidro",
        city: "Buenos Aires",
        country: "🇦🇷 Argentina",
        league: "Metropolitano A",
        foundedYear: 1902,
        description: "Historic Argentine field hockey powerhouse",
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/sanisidro_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Professional Scout Access",
          "Career Mentoring",
          "Physiotherapy",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Club Atletico Belgrano",
        city: "Buenos Aires",
        country: "🇦🇷 Argentina",
        league: "Metropolitano A",
        foundedYear: 1896,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/belgrano_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1552531221-5a0d68c72660?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Education Scholarships",
          "Language Classes",
          "Free Equipment",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Gimnasia y Esgrima Buenos Aires",
        city: "Buenos Aires",
        country: "🇦🇷 Argentina",
        league: "Metropolitano A",
        foundedYear: 1880,
        description: "One of Argentina's oldest sports clubs",
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/gimnasia_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1505666287802-931dc83948e9?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Multi-sport Facilities",
          "Historical Museum",
          "Competitive Leagues",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Club Italiano",
        city: "Buenos Aires",
        country: "🇦🇷 Argentina",
        league: "Metropolitano A",
        foundedYear: 1900,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/italiano_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&h=400&fit=crop",
        isVerified: false,
        benefits: [
          "Cultural Exchange",
          "Family Memberships",
          "Discounts on Gear",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Lomas Athletic Club",
        city: "Lomas de Zamora",
        country: "🇦🇷 Argentina",
        league: "Metropolitano A",
        foundedYear: 1891,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/lomas_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1517836357463-d25ddfcbf042?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: ["Grass Fields", "Syntetic Pitches", "Personal Training"],
      },
    }),
    // International clubs
    prisma.club.create({
      data: {
        name: "HC Rotterdam",
        city: "Rotterdam",
        country: "🇳🇱 Netherlands",
        league: "Hoofdklasse",
        foundedYear: 1925,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/rotterdam_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1536502262293-38cffbe24cbf?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "International Exposure",
          "Sponsorship Deals",
          "Top-tier Competition",
        ],
      },
    }),
    prisma.club.create({
      data: {
        name: "Amsterdam HC",
        city: "Amsterdam",
        country: "🇳🇱 Netherlands",
        league: "Hoofdklasse",
        foundedYear: 1892,
        logo: "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs/amsterdam_logo.png",
        coverImage:
          "https://images.unsplash.com/photo-1483389127117-b6a2102724ae?w=1200&h=400&fit=crop",
        isVerified: true,
        benefits: [
          "Elite Hockey Network",
          "Career Opportunities",
          "Housing Support",
        ],
      },
    }),
  ]);

  console.log(`✅ Created ${clubs.length} clubs\n`);

  // ========== PLAYERS ==========
  console.log("🏃 Creating field hockey players...");

  const playerData = [
    {
      username: "lucia_jimenez",
      email: "lucia@hockey-test.com",
      name: "Lucía Jiménez",
      position: "Forward",
      country: "🇪🇸",
      city: "Madrid",
    },
    {
      username: "pablo_alvarez",
      email: "pablo@hockey-test.com",
      name: "Pablo Álvarez",
      position: "Midfielder",
      country: "🇪🇸",
      city: "Barcelona",
    },
    {
      username: "lucas_martinez",
      email: "lucas@hockey-test.com",
      name: "Lucas Martínez",
      position: "Defender",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "sofia_fernandez",
      email: "sofia@hockey-test.com",
      name: "Sofía Fernández",
      position: "Goalkeeper",
      country: "🇪🇸",
      city: "Madrid",
    },
    {
      username: "juan_rodriguez",
      email: "juan@hockey-test.com",
      name: "Juan Rodríguez",
      position: "Forward",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "maria_lopez",
      email: "maria@hockey-test.com",
      name: "María López",
      position: "Defender",
      country: "🇪🇸",
      city: "Barcelona",
    },
    {
      username: "mateo_garcia",
      email: "mateo@hockey-test.com",
      name: "Mateo García",
      position: "Midfielder",
      country: "🇦🇷",
      city: "Córdoba",
    },
    {
      username: "valentina_sanchez",
      email: "valentina@hockey-test.com",
      name: "Valentina Sánchez",
      position: "Forward",
      country: "🇦🇷",
      city: "Rosario",
    },
    {
      username: "miguel_torres",
      email: "miguel@hockey-test.com",
      name: "Miguel Torres",
      position: "Defender",
      country: "🇪🇸",
      city: "Valencia",
    },
    {
      username: "camila_ramirez",
      email: "camila@hockey-test.com",
      name: "Camila Ramírez",
      position: "Goalkeeper",
      country: "🇦🇷",
      city: "Mendoza",
    },
    {
      username: "alejandro_flores",
      email: "alejandro@hockey-test.com",
      name: "Alejandro Flores",
      position: "Midfielder",
      country: "🇪🇸",
      city: "Sevilla",
    },
    {
      username: "isabella_moreno",
      email: "isabella@hockey-test.com",
      name: "Isabella Moreno",
      position: "Forward",
      country: "🇦🇷",
      city: "La Plata",
    },
    {
      username: "ricardo_gutierrez",
      email: "ricardo@hockey-test.com",
      name: "Ricardo Gutiérrez",
      position: "Defender",
      country: "🇪🇸",
      city: "Bilbao",
    },
    {
      username: "martina_diaz",
      email: "martina@hockey-test.com",
      name: "Martina Díaz",
      position: "Midfielder",
      country: "🇦🇷",
      city: "Tucumán",
    },
    {
      username: "roberto_vazquez",
      email: "roberto@hockey-test.com",
      name: "Roberto Vázquez",
      position: "Forward",
      country: "🇪🇸",
      city: "Zaragoza",
    },
    {
      username: "florencia_castillo",
      email: "florencia@hockey-test.com",
      name: "Florencia Castillo",
      position: "Goalkeeper",
      country: "🇦🇷",
      city: "Salta",
    },
    {
      username: "francisco_ramos",
      email: "francisco@hockey-test.com",
      name: "Francisco Ramos",
      position: "Defender",
      country: "🇪🇸",
      city: "Granada",
    },
    {
      username: "catalina_mendoza",
      email: "catalina@hockey-test.com",
      name: "Catalina Mendoza",
      position: "Midfielder",
      country: "🇦🇷",
      city: "San Juan",
    },
    {
      username: "manuel_ortiz",
      email: "manuel@hockey-test.com",
      name: "Manuel Ortiz",
      position: "Forward",
      country: "🇪🇸",
      city: "Málaga",
    },
    {
      username: "delfina_silva",
      email: "delfina@hockey-test.com",
      name: "Delfina Silva",
      position: "Defender",
      country: "🇦🇷",
      city: "Mar del Plata",
    },
    {
      username: "diego_herrera",
      email: "diego@hockey-test.com",
      name: "Diego Herrera",
      position: "Midfielder",
      country: "🇪🇸",
      city: "Murcia",
    },
    {
      username: "agustina_navarro",
      email: "agustina@hockey-test.com",
      name: "Agustina Navarro",
      position: "Forward",
      country: "🇦🇷",
      city: "Neuquén",
    },
    {
      username: "carlos_ruiz",
      email: "carlos@hockey-test.com",
      name: "Carlos Ruiz",
      position: "Goalkeeper",
      country: "🇪🇸",
      city: "Santander",
    },
    {
      username: "milagros_vega",
      email: "milagros@hockey-test.com",
      name: "Milagros Vega",
      position: "Defender",
      country: "🇦🇷",
      city: "Santa Fe",
    },
    {
      username: "javier_castro",
      email: "javier@hockey-test.com",
      name: "Javier Castro",
      position: "Midfielder",
      country: "🇪🇸",
      city: "Oviedo",
    },
  ];

  // Helper function to determine gender from name
  const getGenderFromName = (name: string): "male" | "female" => {
    const femaleNames = [
      "Lucía",
      "Sofía",
      "María",
      "Valentina",
      "Camila",
      "Isabella",
      "Martina",
      "Florencia",
      "Catalina",
      "Delfina",
      "Agustina",
      "Milagros",
    ];
    const firstName = name.split(" ")[0];
    return femaleNames.includes(firstName) ? "female" : "male";
  };

  // Helper to generate a realistic date of birth for a given age range
  const randomDateOfBirth = (minAge: number, maxAge: number): Date => {
    const age = minAge + Math.floor(Math.random() * (maxAge - minAge + 1));
    const year = new Date().getFullYear() - age;
    const month = Math.floor(Math.random() * 12);
    const day = 1 + Math.floor(Math.random() * 28);
    return new Date(year, month, day);
  };

  // Helper to derive level from years of experience (PROFESSIONAL: >=5 years)
  const levelFromExperience = (yearsOfExperience: number): "PROFESSIONAL" | "AMATEUR" =>
    yearsOfExperience >= 5 ? "PROFESSIONAL" : "AMATEUR";

  const players = [];
  for (let index = 0; index < playerData.length; index++) {
    const player = playerData[index];
    const gender = getGenderFromName(player.name);
    const genderPath = gender === "female" ? "women" : "men";
    const imageNumber = index % 80;

    const yearsOfExperience = index % 2 === 0 ? 3 : 8; // Half Amateur (<5), half Professional (>=5)
    const p = await prisma.user.create({
      data: {
        email: player.email,
        username: player.username,
        name: player.name,
        password: hashedPassword,
        role: "PLAYER",
        position: player.position,
        bio: `Passionate field hockey player. Training hard every day! 🏑`,
        avatar: `https://randomuser.me/api/portraits/${genderPath}/${imageNumber}.jpg`,
        country: player.country,
        city: player.city,
        dateOfBirth: randomDateOfBirth(18, 32),
        level: levelFromExperience(yearsOfExperience),
        yearsOfExperience,
        isVerified: index % 4 === 0,
        isEmailVerified: index % 3 === 0, // ~33% have verified emails
      },
    });
    players.push(p);
  }

  console.log(`✅ Created ${players.length} players\n`);

  // ========== COACHES ==========
  console.log("👔 Creating field hockey coaches...");

  const coachData = [
    {
      username: "coach_martinez",
      email: "coach.martinez@hockey-test.com",
      name: "Carlos Martínez",
      country: "🇪🇸",
      city: "Madrid",
    },
    {
      username: "coach_perez",
      email: "coach.perez@hockey-test.com",
      name: "Ana Pérez",
      country: "🇪🇸",
      city: "Barcelona",
    },
    {
      username: "coach_gonzalez",
      email: "coach.gonzalez@hockey-test.com",
      name: "Roberto González",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "coach_fernandez",
      email: "coach.fernandez@hockey-test.com",
      name: "Laura Fernández",
      country: "🇦🇷",
      city: "Rosario",
    },
    {
      username: "coach_sanchez",
      email: "coach.sanchez@hockey-test.com",
      name: "Miguel Sánchez",
      country: "🇪🇸",
      city: "Valencia",
    },
    {
      username: "coach_rodriguez",
      email: "coach.rodriguez@hockey-test.com",
      name: "Patricia Rodríguez",
      country: "🇦🇷",
      city: "Córdoba",
    },
    {
      username: "coach_garcia",
      email: "coach.garcia@hockey-test.com",
      name: "Fernando García",
      country: "🇪🇸",
      city: "Sevilla",
    },
    {
      username: "coach_lopez",
      email: "coach.lopez@hockey-test.com",
      name: "Gabriela López",
      country: "🇦🇷",
      city: "Mendoza",
    },
  ];

  const coaches = [];
  for (let index = 0; index < coachData.length; index++) {
    const coach = coachData[index];
    const gender = getGenderFromName(coach.name);
    const genderPath = gender === "female" ? "women" : "men";
    const imageNumber = (index + 25) % 80;

    const yearsOfExperience = 10 + index; // All coaches are Professional (>=5)
    const c = await prisma.user.create({
      data: {
        email: coach.email,
        username: coach.username,
        name: coach.name,
        password: hashedPassword,
        role: "COACH",
        bio: `Professional field hockey coach with ${
          10 + index * 2
        } years of experience. Developing champions on and off the field! 🏑`,
        avatar: `https://randomuser.me/api/portraits/${genderPath}/${imageNumber}.jpg`,
        country: coach.country,
        city: coach.city,
        dateOfBirth: randomDateOfBirth(35, 58),
        level: levelFromExperience(yearsOfExperience),
        yearsOfExperience,
        isVerified: index % 2 === 0,
        isEmailVerified: index % 2 === 0, // 50% have verified emails
      },
    });
    coaches.push(c);
  }

  console.log(`✅ Created ${coaches.length} coaches\n`);

  // ========== CLUB USERS (role: CLUB) ==========
  console.log("🔑 Creating club users...");

  const clubUserData = [
    // Spanish clubs admins
    {
      username: "admin_campo_madrid",
      email: "admin.campomadrid@hockey-test.com",
      name: "Antonio López",
      country: "🇪🇸",
      city: "Madrid",
    },
    {
      username: "admin_polo_barcelona",
      email: "admin.polobarcelona@hockey-test.com",
      name: "Marta Soler",
      country: "🇪🇸",
      city: "Barcelona",
    },
    {
      username: "admin_real_polo",
      email: "admin.realpolo@hockey-test.com",
      name: "Jordi Puig",
      country: "🇪🇸",
      city: "Barcelona",
    },
    {
      username: "admin_terrassa",
      email: "admin.terrassa@hockey-test.com",
      name: "Núria Casas",
      country: "🇪🇸",
      city: "Terrassa",
    },
    {
      username: "admin_atletic_terrassa",
      email: "admin.atleticterrassa@hockey-test.com",
      name: "Pau Martínez",
      country: "🇪🇸",
      city: "Terrassa",
    },
    // Argentinian clubs admins
    {
      username: "admin_san_isidro",
      email: "admin.sanisidro@hockey-test.com",
      name: "Gustavo Pérez",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "admin_belgrano",
      email: "admin.belgrano@hockey-test.com",
      name: "Florencia Ríos",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "admin_gimnasia",
      email: "admin.gimnasia@hockey-test.com",
      name: "Hernán Soria",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "admin_italiano",
      email: "admin.italiano@hockey-test.com",
      name: "Silvana Gallo",
      country: "🇦🇷",
      city: "Buenos Aires",
    },
    {
      username: "admin_lomas",
      email: "admin.lomas@hockey-test.com",
      name: "Eduardo Bravo",
      country: "🇦🇷",
      city: "Lomas de Zamora",
    },
    // International clubs admins
    {
      username: "admin_rotterdam",
      email: "admin.rotterdam@hockey-test.com",
      name: "Lars van Dijk",
      country: "🇳🇱",
      city: "Rotterdam",
    },
    {
      username: "admin_amsterdam",
      email: "admin.amsterdam@hockey-test.com",
      name: "Sophie de Boer",
      country: "🇳🇱",
      city: "Amsterdam",
    },
  ];

  const clubUsers = [];
  for (let index = 0; index < clubUserData.length; index++) {
    const clubUser = clubUserData[index];
    const gender = getGenderFromName(clubUser.name);
    const genderPath = gender === "female" ? "women" : "men";
    const cu = await prisma.user.create({
      data: {
        email: clubUser.email,
        username: clubUser.username,
        name: clubUser.name,
        password: hashedPassword,
        role: "CLUB",
        bio: `Club administrator with passion for field hockey. Managing and growing the club every day! 🏑`,
        avatar: `https://randomuser.me/api/portraits/${genderPath}/${50 + index}.jpg`,
        country: clubUser.country,
        city: clubUser.city,
        dateOfBirth: randomDateOfBirth(35, 60),
        level: "PROFESSIONAL",
        yearsOfExperience: 15, // Club users are Professional by default
        isVerified: true,
        isEmailVerified: true,
      },
    });
    clubUsers.push(cu);
  }

  console.log(`✅ Created ${clubUsers.length} club users\n`);

  // ========== SUPERADMIN ==========
  console.log("🛡️  Creating super admin...");

  const superAdmin = await prisma.user.create({
    data: {
      email: "superadmin@hockey-test.com",
      username: "superadmin",
      name: "Hockey Connect Admin",
      password: hashedPassword,
      role: "SUPERADMIN",
      bio: "Platform administrator.",
      avatar: `https://randomuser.me/api/portraits/lego/1.jpg`,
      country: "🇪🇸",
      city: "Madrid",
      isVerified: true,
      isEmailVerified: true,
    },
  });

  console.log(`✅ Created super admin: ${superAdmin.email}\n`);

  // ========== ASSIGN ADMINS, POPULATE CLUBS & ASSIGN MEMBERS ==========
  console.log(
    "🔗 Populating complete club data and assigning admins/members...",
  );

  for (let index = 0; index < clubs.length; index++) {
    const club = clubs[index];
    await prisma.club.update({
      where: { id: club.id },
      data: {
        adminId: clubUsers[index % clubUsers.length].id,
        email:
          club.email ||
          `contact@${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}.com`,
        phone:
          club.phone ||
          `+34 600 ${Math.floor(100000 + Math.random() * 900000)}`,
        website:
          club.website ||
          `https://www.${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}.com`,
        description:
          club.description ||
          `Welcome to ${club.name}, one of the premier field hockey clubs with a rich history and a passionate community.`,
        bio:
          club.bio ||
          `Official account of ${club.name}. Join us on the pitch!`,
        league: club.league || "Primera División",
        instagram: `https://instagram.com/${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}`,
        twitter: `https://x.com/${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}`,
        facebook: `https://facebook.com/${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}`,
        tiktok: `https://tiktok.com/@${club.name.replace(/[^a-zA-Z]/g, "").toLowerCase()}`,
      },
    });
  }

  const clubMembersCreated = [];
  const allMembers = [...players, ...coaches, ...clubUsers];
  for (let index = 0; index < allMembers.length; index++) {
    const user = allMembers[index];
    const club = clubs[index % clubs.length];
    const cm = await prisma.clubMember.create({
      data: {
        clubId: club.id,
        userId: user.id,
        roleInClub: user.role === "COACH" ? "COACH" : "MEMBER",
        status: "ACTIVE",
        invitedById: clubUsers[index % clubUsers.length].id,
      },
    });
    clubMembersCreated.push(cm);
  }

  console.log(
    `✅ Each club now has a dedicated CLUB user as admin and fully populated data`,
  );
  console.log(`✅ Created ${clubMembersCreated.length} club members\n`);



  // ========== JOB OPPORTUNITIES ==========
  console.log("💼 Creating job opportunities...");

  const jobData = [
    {
      title: "Forward Player Needed",
      type: "PLAYER",
      level: "PROFESSIONAL",
      desc: "Looking for an experienced forward to join our first team. Must have at least 3 years of competitive experience.",
      salary: 28000,
      currency: "EUR",
    },
    {
      title: "Youth Team Coach",
      type: "COACH",
      level: "AMATEUR",
      desc: "We need an enthusiastic coach for our U16 team. Experience with youth development preferred.",
      salary: 32000,
      currency: "EUR",
    },
    {
      title: "Defensive Player",
      type: "PLAYER",
      level: "AMATEUR",
      desc: "Defensive position open for the upcoming season. Strong tackling skills required.",
      salary: 24000,
      currency: "EUR",
    },
    {
      title: "Goalkeeper Required",
      type: "PLAYER",
      level: "PROFESSIONAL",
      desc: "First team goalkeeper position available. Must have national league experience.",
      salary: 30000,
      currency: "EUR",
    },
    {
      title: "Head Coach Position",
      type: "COACH",
      level: "PROFESSIONAL",
      desc: "Senior coaching role for our premier team. 5+ years experience required.",
      salary: 45000,
      currency: "EUR",
    },
    {
      title: "Fitness Trainer",
      type: "STAFF",
      level: "PROFESSIONAL",
      desc: "Certified fitness trainer needed for professional team preparation.",
      salary: 26000,
      currency: "EUR",
    },
    {
      title: "Midfielder - Professional Contract",
      type: "PLAYER",
      level: "PROFESSIONAL",
      desc: "Seeking creative midfielder with excellent passing ability.",
      salary: 25000,
      currency: "EUR",
    },
    {
      title: "Assistant Coach",
      type: "COACH",
      level: "PROFESSIONAL",
      desc: "Assistant coaching position for first team. Tactical knowledge essential.",
      salary: 28000,
      currency: "EUR",
    },
  ];

  for (const job of jobData) {
    const randomClub = clubs[Math.floor(Math.random() * clubs.length)];
    await prisma.jobOpportunity.create({
      data: {
        title: job.title,
        description: job.desc,
        positionType: job.type as any,
        level: job.level as any,
        clubId: randomClub.id,
        country: randomClub.country,
        city: randomClub.city,
        salary: job.salary,
        currency: job.currency as any,
        status: Math.random() > 0.2 ? "OPEN" : "FILLED", // 80% open
        benefits:
          "Medical insurance, accommodation support, full equipment, training facilities",
      },
    });
  }

  console.log(`✅ Created ${jobData.length} job opportunities\n`);

  // ========== TRAJECTORIES ==========
  console.log("🏆 Creating career trajectories...");

  let trajCount = 0;

  // Sample trajectory templates based on the image
  const trajectoryTemplates = [
    {
      organization: "Youth Academy",
      period: "2010-2015",
      description:
        "Beginning of my career - Started playing field hockey at the age of 10.",
      isCurrent: false,
      order: 0,
    },
    {
      organization: "Local Club",
      period: "2015-2020",
      description:
        "First professional experience - Developed fundamental skills and game understanding.",
      isCurrent: false,
      order: 1,
    },
    {
      organization: "National Team U21",
      period: "2018-2021",
      description:
        "Represented my country at youth level - Gained international experience.",
      isCurrent: false,
      order: 2,
    },
  ];

  // Create trajectories for ALL players (not just first 10)
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const playerClub = clubs[i % clubs.length];

    // Early career (youth)
    await prisma.trajectory.create({
      data: {
        userId: player.id,
        title: "Youth Player",
        organization: `${player.city} Youth Academy`,
        period: "2010-2016",
        description: `Beginning of my career as a ${player.position} - Started playing field hockey at the age of 10.`,
        startDate: new Date("2010-01-01"),
        endDate: new Date("2016-12-31"),
        isCurrent: false,
        order: 0,
      },
    });

    // Mid career (club)
    await prisma.trajectory.create({
      data: {
        userId: player.id,
        clubId: playerClub.id,
        title: player.position,
        organization: playerClub.name,
        period: "2017-2023",
        description:
          "First professional contract - Developed my skills and became a regular starter.",
        startDate: new Date("2017-01-01"),
        endDate: new Date("2023-12-31"),
        isCurrent: false,
        order: 1,
      },
    });

    // International experience (if applicable - every 3rd player)
    if (i % 3 === 0) {
      const intlClub = clubs[(i + 5) % clubs.length];
      await prisma.trajectory.create({
        data: {
          userId: player.id,
          clubId: intlClub.id,
          title: player.position,
          organization: intlClub.name,
          period: "2023-2024",
          description: `First international experience in ${intlClub.country} - First season, promotion to top division. Second season, competitive performance at elite level.`,
          startDate: new Date("2023-01-01"),
          endDate: new Date("2024-12-31"),
          isCurrent: false,
          order: 2,
        },
      });
      trajCount++;
    }

    // Current position
    const currentClub = clubs[(i + 2) % clubs.length];
    await prisma.trajectory.create({
      data: {
        userId: player.id,
        clubId: currentClub.id,
        title: player.position,
        organization: currentClub.name,
        period: "2024-Present",
        description: `Current club - Playing at ${currentClub.league || "professional"} level.`,
        startDate: new Date("2024-01-01"),
        isCurrent: true,
        order: 3,
      },
    });

    trajCount += 3; // At least 3 trajectories per player (4 for every 3rd player)
  }

  // Create trajectories for ALL coaches (not just first 5)
  for (let i = 0; i < coaches.length; i++) {
    const coach = coaches[i];
    const coachClub = clubs[i % clubs.length];

    // Playing career (many coaches were former players)
    await prisma.trajectory.create({
      data: {
        userId: coach.id,
        clubId: coachClub.id,
        title: "Professional Player",
        organization: coachClub.name,
        period: "2005-2012",
        description:
          "Professional playing career - Gained valuable experience as a player which now informs my coaching philosophy.",
        startDate: new Date("2005-01-01"),
        endDate: new Date("2012-12-31"),
        isCurrent: false,
        order: 0,
      },
    });

    // Assistant coach position
    const assistantClub = clubs[(i + 1) % clubs.length];
    await prisma.trajectory.create({
      data: {
        userId: coach.id,
        clubId: assistantClub.id,
        title: "Assistant Coach",
        organization: assistantClub.name,
        period: "2013-2018",
        description:
          "Started coaching career as assistant coach - Focused on tactical development and player training.",
        startDate: new Date("2013-01-01"),
        endDate: new Date("2018-12-31"),
        isCurrent: false,
        order: 1,
      },
    });

    // Youth team head coach (transition role)
    const youthClub = clubs[(i + 2) % clubs.length];
    await prisma.trajectory.create({
      data: {
        userId: coach.id,
        clubId: youthClub.id,
        title: "Youth Team Head Coach",
        organization: youthClub.name,
        period: "2019-2022",
        description:
          "Led youth development program - Focused on developing young talent and building strong team foundations.",
        startDate: new Date("2019-01-01"),
        endDate: new Date("2022-12-31"),
        isCurrent: false,
        order: 2,
      },
    });

    // Head coach position (current)
    const currentCoachClub = clubs[(i + 3) % clubs.length];
    await prisma.trajectory.create({
      data: {
        userId: coach.id,
        clubId: currentCoachClub.id,
        title: "Head Coach",
        organization: currentCoachClub.name,
        period: "2023-Present",
        description:
          "Promoted to head coach of first team - Leading the team to championships and developing young talent.",
        startDate: new Date("2023-01-01"),
        isCurrent: true,
        order: 3,
      },
    });

    trajCount += 4; // 4 trajectories per coach
  }

  console.log(`✅ Created ${trajCount} career trajectories\n`);

  console.log("🎉 Database seeded successfully!\n");
  console.log("📊 Summary:");
  console.log(`   - ${clubs.length} clubs`);
  console.log(`   - ${clubUsers.length} club users (role CLUB)`);
  console.log(`   - 1 super admin`);
  console.log(`   - ${players.length} players`);
  console.log(`   - ${coaches.length} coaches`);
  console.log(`   - ${jobData.length} job opportunities`);
  console.log(`   - ${trajCount} career trajectories\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
