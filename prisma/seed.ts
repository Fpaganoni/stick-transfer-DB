import { Club, PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

/**
 * A Club row plus the identity fields that live on its owner User (name, city,
 * country, bio, logo = User.avatar). Seed-only convenience so trajectories and
 * jobs can read `club.name` / `club.city` like before.
 */
type SeededClub = Club & {
  name: string;
  city: string;
  country: string;
  bio: string | null;
  logo: string | null;
};

// User.position stores the PLAYER enum (see resolvePosition in
// src/users/validation/credentials.ts); trajectories need a readable label.
const POSITION_LABEL: Record<string, string> = {
  goalkeeper: "Goalkeeper",
  defender: "Defender",
  midfielder: "Midfielder",
  attacker: "Forward",
};

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
    prisma.newsArticle.deleteMany(),
    prisma.trajectory.deleteMany(),
    prisma.umpireCertification.deleteMany(),
    prisma.clubMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.club.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log("✅ Data cleared\n");

  // Hash password for all mock users
  const hashedPassword = await bcrypt.hash("password123", 10);

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

  // ========== CLUB ACCOUNTS (role: CLUB) ==========
  // A club account IS the club: User.name is the club name, User.avatar its
  // crest, and cover / bio / city / country live on the User too. The Club row
  // only holds club data (league, description, contacts, benefits...), and
  // managedBy is the person who runs the account (private to the owner and
  // SUPERADMIN). No randomuser photos: the crest is the club logo.
  console.log("🏑 Creating club accounts...");

  const COVERS = {
    stadium: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&h=400&fit=crop",
    night: "https://images.unsplash.com/photo-1483389127117-b6a2102724ae?w=1200&h=400&fit=crop",
    pitch: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop",
    arena: "https://images.unsplash.com/photo-1505666287802-931dc83948e9?w=1200&h=400&fit=crop",
  };
  const LOGO_BASE = "https://res.cloudinary.com/dlv9qzhzr/image/upload/hockey-connect/clubs";

  const clubSeeds = [
    // Spanish clubs
    {
      username: "ccvillamadrid",
      email: "admin.campomadrid@hockey-test.com",
      managedBy: ["Antonio", "López"],
      name: "Club de Campo Villa de Madrid",
      country: "ES",
      city: "Madrid",
      league: "División de Honor",
      foundedYear: 1929,
      description: "One of the most prestigious field hockey clubs in Spain",
      bio: "Excellence in field hockey since 1929",
      logo: `${LOGO_BASE}/ccvm_logo.png`,
      coverImage: COVERS.stadium,
      isVerified: true,
      benefits: ["Professional Coaching", "International Tours", "Full Medical Support", "Sponsorship Opportunities"],
    },
    {
      username: "rcpolobarcelona",
      email: "admin.polobarcelona@hockey-test.com",
      managedBy: ["Marta", "Soler"],
      name: "RC Polo Barcelona",
      country: "ES",
      city: "Barcelona",
      league: "División de Honor",
      foundedYear: 1897,
      description: "Historic Barcelona field hockey club with multiple championships",
      bio: "Tradition and excellence in field hockey",
      logo: `${LOGO_BASE}/rcpolo_logo.png`,
      coverImage: COVERS.arena,
      isVerified: true,
      benefits: ["Elite Training Facilities", "Gym Access", "Player Networking", "High Performance Center"],
    },
    {
      username: "realclubpolo",
      email: "admin.realpolo@hockey-test.com",
      managedBy: ["Jordi", "Puig"],
      name: "Real Club de Polo",
      country: "ES",
      city: "Barcelona",
      league: "División de Honor",
      foundedYear: 1942,
      description: "Social and sports club with a strong field hockey section",
      bio: "Official account of Real Club de Polo. Join us on the pitch!",
      logo: `${LOGO_BASE}/realclubpolo_logo.png`,
      coverImage: COVERS.night,
      isVerified: true,
      benefits: ["Swimming Pool", "Social Events", "Tennis Courts"],
    },
    {
      username: "cdterrassa",
      email: "admin.terrassa@hockey-test.com",
      managedBy: ["Núria", "Casas"],
      name: "CD Terrassa HC",
      country: "ES",
      city: "Terrassa",
      league: "División de Honor",
      foundedYear: 1952,
      description: "European champion field hockey club",
      bio: "Official account of CD Terrassa HC. Join us on the pitch!",
      logo: `${LOGO_BASE}/cdterrassa_logo.png`,
      coverImage: COVERS.pitch,
      isVerified: true,
      benefits: ["Youth Academy", "Video Analysis", "Nutrition Planning"],
    },
    {
      username: "atleticterrassa",
      email: "admin.atleticterrassa@hockey-test.com",
      managedBy: ["Pau", "Martínez"],
      name: "Atlètic Terrassa HC",
      country: "ES",
      city: "Terrassa",
      league: "División de Honor",
      foundedYear: 1952,
      description: "Terrassa club known for its indoor and outdoor programs",
      bio: "Official account of Atlètic Terrassa HC. Join us on the pitch!",
      logo: `${LOGO_BASE}/atleticterrassa_logo.png`,
      coverImage: COVERS.night,
      isVerified: true,
      benefits: ["Indoor Hockey Pitch", "Summer Camps", "Psychological Support"],
    },
    // Argentinian clubs
    {
      username: "casanisidro",
      email: "admin.sanisidro@hockey-test.com",
      managedBy: ["Gustavo", "Pérez"],
      name: "Club Atlético San Isidro",
      country: "AR",
      city: "Buenos Aires",
      league: "Metropolitano A",
      foundedYear: 1902,
      description: "Historic Argentine field hockey powerhouse",
      bio: "Official account of Club Atlético San Isidro. Join us on the pitch!",
      logo: `${LOGO_BASE}/sanisidro_logo.png`,
      coverImage: COVERS.pitch,
      isVerified: true,
      benefits: ["Professional Scout Access", "Career Mentoring", "Physiotherapy"],
    },
    {
      username: "belgranoac",
      email: "admin.belgrano@hockey-test.com",
      managedBy: ["Florencia", "Ríos"],
      name: "Club Atletico Belgrano",
      country: "AR",
      city: "Buenos Aires",
      league: "Metropolitano A",
      foundedYear: 1896,
      description: "Traditional Buenos Aires club with a large youth section",
      bio: "Official account of Club Atletico Belgrano. Join us on the pitch!",
      logo: `${LOGO_BASE}/belgrano_logo.png`,
      coverImage: COVERS.stadium,
      isVerified: true,
      benefits: ["Education Scholarships", "Language Classes", "Free Equipment"],
    },
    {
      username: "gimnasiaesgrima",
      email: "admin.gimnasia@hockey-test.com",
      managedBy: ["Hernán", "Soria"],
      name: "Gimnasia y Esgrima Buenos Aires",
      country: "AR",
      city: "Buenos Aires",
      league: "Metropolitano A",
      foundedYear: 1880,
      description: "One of Argentina's oldest sports clubs",
      bio: "Official account of Gimnasia y Esgrima Buenos Aires. Join us on the pitch!",
      logo: `${LOGO_BASE}/gimnasia_logo.png`,
      coverImage: COVERS.arena,
      isVerified: true,
      benefits: ["Multi-sport Facilities", "Historical Museum", "Competitive Leagues"],
    },
    {
      username: "clubitaliano",
      email: "admin.italiano@hockey-test.com",
      managedBy: ["Silvana", "Gallo"],
      name: "Club Italiano",
      country: "AR",
      city: "Buenos Aires",
      league: "Metropolitano A",
      foundedYear: 1900,
      description: "Community club that keeps its Italian roots alive through sport",
      bio: "Official account of Club Italiano. Join us on the pitch!",
      logo: `${LOGO_BASE}/italiano_logo.png`,
      coverImage: COVERS.stadium,
      // Left unverified on purpose, to exercise the verification flow
      isVerified: false,
      benefits: ["Cultural Exchange", "Family Memberships", "Discounts on Gear"],
    },
    {
      username: "lomasathletic",
      email: "admin.lomas@hockey-test.com",
      managedBy: ["Eduardo", "Bravo"],
      name: "Lomas Athletic Club",
      country: "AR",
      city: "Lomas de Zamora",
      league: "Metropolitano A",
      foundedYear: 1891,
      description: "Grass and synthetic pitches in the south of Buenos Aires",
      bio: "Official account of Lomas Athletic Club. Join us on the pitch!",
      logo: `${LOGO_BASE}/lomas_logo.png`,
      coverImage: COVERS.night,
      isVerified: true,
      benefits: ["Grass Fields", "Syntetic Pitches", "Personal Training"],
    },
    // International clubs
    {
      username: "hcrotterdam",
      email: "admin.rotterdam@hockey-test.com",
      managedBy: ["Lars", "van Dijk"],
      name: "HC Rotterdam",
      country: "NL",
      city: "Rotterdam",
      league: "Hoofdklasse",
      foundedYear: 1925,
      description: "Dutch top-flight club with an international outlook",
      bio: "Official account of HC Rotterdam. Join us on the pitch!",
      logo: `${LOGO_BASE}/rotterdam_logo.png`,
      coverImage: COVERS.arena,
      isVerified: true,
      benefits: ["International Exposure", "Sponsorship Deals", "Top-tier Competition"],
    },
    {
      username: "amsterdamhc",
      email: "admin.amsterdam@hockey-test.com",
      managedBy: ["Sophie", "de Boer"],
      name: "Amsterdam HC",
      country: "NL",
      city: "Amsterdam",
      league: "Hoofdklasse",
      foundedYear: 1892,
      description: "One of the oldest hockey clubs in the world",
      bio: "Official account of Amsterdam HC. Join us on the pitch!",
      logo: `${LOGO_BASE}/amsterdam_logo.png`,
      coverImage: COVERS.night,
      isVerified: true,
      benefits: ["Elite Hockey Network", "Career Opportunities", "Housing Support"],
    },
  ];

  // Every logo/cover is checked with a HEAD request: anything that does not
  // answer 200 is stored as null (and listed at the end) instead of shipping a
  // broken image. Offline runs keep the url and say that it was not verified.
  const imageUrls = [...new Set(clubSeeds.flatMap((c) => [c.logo, c.coverImage]))];
  const brokenImageUrls: string[] = [];
  const unverifiedImageUrls: string[] = [];
  const urlStatus = new Map<string, "ok" | "broken" | "unverified">();
  await Promise.all(
    imageUrls.map(async (url) => {
      try {
        const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
        urlStatus.set(url, res.status === 200 ? "ok" : "broken");
        if (res.status !== 200) brokenImageUrls.push(`${res.status} ${url}`);
      } catch {
        urlStatus.set(url, "unverified");
        unverifiedImageUrls.push(url);
      }
    }),
  );
  const imageOrNull = (url: string): string | null =>
    urlStatus.get(url) === "broken" ? null : url;

  const clubUsers = [];
  const clubs: SeededClub[] = [];
  for (let index = 0; index < clubSeeds.length; index++) {
    const club = clubSeeds[index];
    const handle = club.name.replace(/[^a-zA-Z]/g, "").toLowerCase();
    const clubUser = await prisma.user.create({
      data: {
        email: club.email,
        username: club.username,
        name: club.name,
        password: hashedPassword,
        role: "CLUB",
        bio: club.bio,
        avatar: imageOrNull(club.logo),
        coverImage: imageOrNull(club.coverImage),
        country: club.country,
        city: club.city,
        isVerified: club.isVerified,
        isEmailVerified: true,
        clubProfile: {
          create: {
            managedByFirstName: club.managedBy[0],
            managedByLastName: club.managedBy[1],
            league: club.league,
            foundedYear: club.foundedYear,
            description: club.description,
            email: `contact@${handle}.com`,
            phone: `+34 600 ${100000 + index * 11111}`,
            website: `https://www.${handle}.com`,
            instagram: `https://instagram.com/${handle}`,
            twitter: `https://x.com/${handle}`,
            facebook: `https://facebook.com/${handle}`,
            tiktok: `https://tiktok.com/@${handle}`,
            isVerified: club.isVerified,
            verificationStatus: club.isVerified ? "VERIFIED" : "UNVERIFIED",
            benefits: club.benefits,
          },
        },
      },
      include: { clubProfile: true },
    });
    clubUsers.push(clubUser);
    // Identity fields are read from the User; they are copied here only so the
    // rest of the seed can keep using one `clubs[i].name` style object.
    clubs.push({
      ...clubUser.clubProfile!,
      name: clubUser.name,
      city: clubUser.city!,
      country: clubUser.country!,
      bio: clubUser.bio,
      logo: clubUser.avatar,
    });
  }

  console.log(`✅ Created ${clubs.length} club accounts (User + Club)\n`);

  // ========== PLAYERS ==========
  console.log("🏃 Creating field hockey players...");

  const playerData = [
    {
      username: "lucia_jimenez",
      email: "lucia@hockey-test.com",
      name: "Lucía Jiménez",
      position: "attacker",
      country: "ES",
      city: "Madrid",
    },
    {
      username: "pablo_alvarez",
      email: "pablo@hockey-test.com",
      name: "Pablo Álvarez",
      position: "midfielder",
      country: "ES",
      city: "Barcelona",
    },
    {
      username: "lucas_martinez",
      email: "lucas@hockey-test.com",
      name: "Lucas Martínez",
      position: "defender",
      country: "AR",
      city: "Buenos Aires",
    },
    {
      username: "sofia_fernandez",
      email: "sofia@hockey-test.com",
      name: "Sofía Fernández",
      position: "goalkeeper",
      country: "ES",
      city: "Madrid",
    },
    {
      username: "juan_rodriguez",
      email: "juan@hockey-test.com",
      name: "Juan Rodríguez",
      position: "attacker",
      country: "AR",
      city: "Buenos Aires",
    },
    {
      username: "maria_lopez",
      email: "maria@hockey-test.com",
      name: "María López",
      position: "defender",
      country: "ES",
      city: "Barcelona",
    },
    {
      username: "mateo_garcia",
      email: "mateo@hockey-test.com",
      name: "Mateo García",
      position: "midfielder",
      country: "AR",
      city: "Córdoba",
    },
    {
      username: "valentina_sanchez",
      email: "valentina@hockey-test.com",
      name: "Valentina Sánchez",
      position: "attacker",
      country: "AR",
      city: "Rosario",
    },
    {
      username: "miguel_torres",
      email: "miguel@hockey-test.com",
      name: "Miguel Torres",
      position: "defender",
      country: "ES",
      city: "Valencia",
    },
    {
      username: "camila_ramirez",
      email: "camila@hockey-test.com",
      name: "Camila Ramírez",
      position: "goalkeeper",
      country: "AR",
      city: "Mendoza",
    },
    {
      username: "alejandro_flores",
      email: "alejandro@hockey-test.com",
      name: "Alejandro Flores",
      position: "midfielder",
      country: "ES",
      city: "Sevilla",
    },
    {
      username: "isabella_moreno",
      email: "isabella@hockey-test.com",
      name: "Isabella Moreno",
      position: "attacker",
      country: "AR",
      city: "La Plata",
    },
    {
      username: "ricardo_gutierrez",
      email: "ricardo@hockey-test.com",
      name: "Ricardo Gutiérrez",
      position: "defender",
      country: "ES",
      city: "Bilbao",
    },
    {
      username: "martina_diaz",
      email: "martina@hockey-test.com",
      name: "Martina Díaz",
      position: "midfielder",
      country: "AR",
      city: "Tucumán",
    },
    {
      username: "roberto_vazquez",
      email: "roberto@hockey-test.com",
      name: "Roberto Vázquez",
      position: "attacker",
      country: "ES",
      city: "Zaragoza",
    },
    {
      username: "florencia_castillo",
      email: "florencia@hockey-test.com",
      name: "Florencia Castillo",
      position: "goalkeeper",
      country: "AR",
      city: "Salta",
    },
    {
      username: "francisco_ramos",
      email: "francisco@hockey-test.com",
      name: "Francisco Ramos",
      position: "defender",
      country: "ES",
      city: "Granada",
    },
    {
      username: "catalina_mendoza",
      email: "catalina@hockey-test.com",
      name: "Catalina Mendoza",
      position: "midfielder",
      country: "AR",
      city: "San Juan",
    },
    {
      username: "manuel_ortiz",
      email: "manuel@hockey-test.com",
      name: "Manuel Ortiz",
      position: "attacker",
      country: "ES",
      city: "Málaga",
    },
    {
      username: "delfina_silva",
      email: "delfina@hockey-test.com",
      name: "Delfina Silva",
      position: "defender",
      country: "AR",
      city: "Mar del Plata",
    },
    {
      username: "diego_herrera",
      email: "diego@hockey-test.com",
      name: "Diego Herrera",
      position: "midfielder",
      country: "ES",
      city: "Murcia",
    },
    {
      username: "agustina_navarro",
      email: "agustina@hockey-test.com",
      name: "Agustina Navarro",
      position: "attacker",
      country: "AR",
      city: "Neuquén",
    },
    {
      username: "carlos_ruiz",
      email: "carlos@hockey-test.com",
      name: "Carlos Ruiz",
      position: "goalkeeper",
      country: "ES",
      city: "Santander",
    },
    {
      username: "milagros_vega",
      email: "milagros@hockey-test.com",
      name: "Milagros Vega",
      position: "defender",
      country: "AR",
      city: "Santa Fe",
    },
    {
      username: "javier_castro",
      email: "javier@hockey-test.com",
      name: "Javier Castro",
      position: "midfielder",
      country: "ES",
      city: "Oviedo",
    },
  ];

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
      country: "ES",
      city: "Madrid",
    },
    {
      username: "coach_perez",
      email: "coach.perez@hockey-test.com",
      name: "Ana Pérez",
      country: "ES",
      city: "Barcelona",
    },
    {
      username: "coach_gonzalez",
      email: "coach.gonzalez@hockey-test.com",
      name: "Roberto González",
      country: "AR",
      city: "Buenos Aires",
    },
    {
      username: "coach_fernandez",
      email: "coach.fernandez@hockey-test.com",
      name: "Laura Fernández",
      country: "AR",
      city: "Rosario",
    },
    {
      username: "coach_sanchez",
      email: "coach.sanchez@hockey-test.com",
      name: "Miguel Sánchez",
      country: "ES",
      city: "Valencia",
    },
    {
      username: "coach_rodriguez",
      email: "coach.rodriguez@hockey-test.com",
      name: "Patricia Rodríguez",
      country: "AR",
      city: "Córdoba",
    },
    {
      username: "coach_garcia",
      email: "coach.garcia@hockey-test.com",
      name: "Fernando García",
      country: "ES",
      city: "Sevilla",
    },
    {
      username: "coach_lopez",
      email: "coach.lopez@hockey-test.com",
      name: "Gabriela López",
      country: "AR",
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

  // ========== UMPIRES ==========
  console.log("🟨 Creating umpires...");

  const umpireData = [
    {
      username: "umpire_garcia",
      email: "umpire.garcia@hockey-test.com",
      name: "Javier García",
      country: "ES",
      city: "Madrid",
      licenseLevel: "INTERNACIONAL",
      certifyingBody: "Real Federación Española de Hockey",
      licenseNumber: "RFEH-INT-0142",
      certificationYear: 2012,
      matchesOfficiated: 640,
      travelAvailability: "INTERNACIONAL",
      languages: ["Español", "English", "Français"],
      modalities: ["OUTDOOR", "INDOOR"],
      umpireCategories: ["MAYORES", "MASCULINO", "FEMENINO"],
    },
    {
      username: "umpire_vanderberg",
      email: "umpire.vanderberg@hockey-test.com",
      name: "Sofía Vanderberg",
      country: "NL",
      city: "Amsterdam",
      licenseLevel: "INTERNACIONAL",
      certifyingBody: "Koninklijke Nederlandse Hockey Bond",
      licenseNumber: "KNHB-INT-0388",
      certificationYear: 2015,
      matchesOfficiated: 410,
      travelAvailability: "INTERNACIONAL",
      languages: ["Nederlands", "English", "Deutsch"],
      modalities: ["OUTDOOR", "INDOOR"],
      umpireCategories: ["MAYORES", "FEMENINO", "JUVENIL"],
    },
    {
      username: "umpire_rodriguez",
      email: "umpire.rodriguez@hockey-test.com",
      name: "Martín Rodríguez",
      country: "AR",
      city: "Buenos Aires",
      licenseLevel: "NACIONAL",
      certifyingBody: "Confederación Argentina de Hockey",
      licenseNumber: "CAH-NAC-2210",
      certificationYear: 2017,
      matchesOfficiated: 280,
      travelAvailability: "NACIONAL",
      languages: ["Español", "English"],
      modalities: ["OUTDOOR"],
      umpireCategories: ["MAYORES", "MASCULINO", "VETERANOS"],
    },
    {
      username: "umpire_fernandez",
      email: "umpire.fernandez@hockey-test.com",
      name: "Lucía Fernández",
      country: "AR",
      city: "Lomas de Zamora",
      licenseLevel: "NACIONAL",
      certifyingBody: "Confederación Argentina de Hockey",
      licenseNumber: "CAH-NAC-2467",
      certificationYear: 2019,
      matchesOfficiated: 195,
      travelAvailability: "REGIONAL",
      languages: ["Español"],
      modalities: ["OUTDOOR", "INDOOR"],
      umpireCategories: ["FEMENINO", "JUVENIL"],
    },
    {
      username: "umpire_soler",
      email: "umpire.soler@hockey-test.com",
      name: "Pau Soler",
      country: "ES",
      city: "Terrassa",
      licenseLevel: "REGIONAL",
      certifyingBody: "Federació Catalana d'Hoquei",
      licenseNumber: "FCH-REG-0931",
      certificationYear: 2021,
      matchesOfficiated: 85,
      travelAvailability: "LOCAL",
      languages: ["Català", "Español"],
      modalities: ["OUTDOOR", "INDOOR"],
      umpireCategories: ["JUVENIL", "MASCULINO"],
    },
    {
      username: "umpire_alvarez",
      email: "umpire.alvarez@hockey-test.com",
      name: "Camila Álvarez",
      country: "AR",
      city: "Buenos Aires",
      licenseLevel: "REGIONAL",
      certifyingBody: "Asociación Metropolitana de Hockey",
      licenseNumber: "AMH-REG-1578",
      certificationYear: 2023,
      matchesOfficiated: 32,
      travelAvailability: "LOCAL",
      languages: ["Español", "English"],
      modalities: ["OUTDOOR"],
      umpireCategories: ["JUVENIL", "FEMENINO"],
    },
  ] as const;

  const umpires = [];
  for (let index = 0; index < umpireData.length; index++) {
    const u = umpireData[index];
    const gender = getGenderFromName(u.name);
    const genderPath = gender === "female" ? "women" : "men";
    const imageNumber = (index + 55) % 80;
    const yearsOfExperience = new Date().getFullYear() - u.certificationYear;

    const created = await prisma.user.create({
      data: {
        email: u.email,
        username: u.username,
        name: u.name,
        password: hashedPassword,
        role: "UMPIRE",
        bio: `Field hockey umpire (${u.licenseLevel.toLowerCase()} license) with ${u.matchesOfficiated} matches officiated. Fair play first! 🏑`,
        avatar: `https://randomuser.me/api/portraits/${genderPath}/${imageNumber}.jpg`,
        country: u.country,
        city: u.city,
        dateOfBirth: randomDateOfBirth(26, 55),
        yearsOfExperience,
        licenseLevel: u.licenseLevel,
        certifyingBody: u.certifyingBody,
        licenseNumber: u.licenseNumber,
        certificationYear: u.certificationYear,
        matchesOfficiated: u.matchesOfficiated,
        travelAvailability: u.travelAvailability,
        languages: [...u.languages],
        modalities: [...u.modalities],
        umpireCategories: [...u.umpireCategories],
        // First 4 verified by admin; the last 2 stay pending to exercise the flow
        isVerified: index < 4,
        isEmailVerified: true,
      },
    });
    umpires.push(created);

    await prisma.umpireCertification.createMany({
      data: [
        {
          userId: created.id,
          name: `Licencia de umpire ${u.licenseLevel.toLowerCase()}`,
          issuer: u.certifyingBody,
          issuedAt: new Date(u.certificationYear, 5, 1),
          order: 0,
        },
        {
          userId: created.id,
          name: "Curso de actualizacion de reglas",
          issuer: u.certifyingBody,
          issuedAt: new Date(new Date().getFullYear() - 1, 8, 1),
          order: 1,
        },
      ],
    });

    await prisma.trajectory.createMany({
      data: [
        {
          userId: created.id,
          title: "Umpire - Liga nacional",
          organization: u.certifyingBody,
          period: `${u.certificationYear + 1} - Present`,
          startDate: new Date(u.certificationYear + 1, 0, 1),
          isCurrent: true,
          order: 0,
        },
        {
          userId: created.id,
          title: "Umpire - Torneo juvenil",
          organization: u.certifyingBody,
          period: `${u.certificationYear} - ${u.certificationYear + 1}`,
          startDate: new Date(u.certificationYear, 0, 1),
          endDate: new Date(u.certificationYear + 1, 0, 1),
          order: 1,
        },
      ],
    });
  }

  console.log(`✅ Created ${umpires.length} umpires\n`);

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
      country: "ES",
      city: "Madrid",
      isVerified: true,
      isEmailVerified: true,
    },
  });

  console.log(`✅ Created super admin: ${superAdmin.email}\n`);

  // ========== ASSIGN MEMBERS ==========
  // Club accounts are the clubs themselves, so only players and coaches join
  // them as members. Each invitation comes from a club account.
  console.log("🔗 Assigning members to clubs...");

  const clubMembersCreated = [];
  const allMembers = [...players, ...coaches];
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

  // Deterministic on purpose: a fixed club per job and a fixed status, so the
  // test accounts below always find the same OPEN / FILLED jobs after a reset.
  const jobs = [];
  for (let index = 0; index < jobData.length; index++) {
    const job = jobData[index];
    // 5 is coprime with 12 clubs: 7 jobs land on 7 different clubs
    const jobClub = clubs[(index * 5) % clubs.length];
    jobs.push(
      await prisma.jobOpportunity.create({
        data: {
          title: job.title,
          description: job.desc,
          positionType: job.type as any,
          level: job.level as any,
          clubId: jobClub.id,
          country: jobClub.country,
          city: jobClub.city,
          salary: job.salary,
          currency: job.currency as any,
          status: index === jobData.length - 1 ? "FILLED" : "OPEN", // last one is closed
          benefits:
            "Medical insurance, accommodation support, full equipment, training facilities",
        },
      }),
    );
  }

  console.log(`✅ Created ${jobData.length} job opportunities\n`);

  // ========== UMPIRE JOB OPPORTUNITIES ==========
  console.log("🟨 Creating umpire job opportunities...");

  const daysFromNow = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const umpireJobData = [
    {
      club: clubs[0], // Madrid
      title: "Umpire - Division de Honor Masculina",
      desc: "Looking for an experienced umpire for a top-flight men's match. Travel expenses covered.",
      level: "PROFESSIONAL",
      licenseLevelRequired: "NACIONAL",
      modality: "OUTDOOR",
      umpireCategory: "MASCULINO",
      matchDate: daysFromNow(21),
      salary: 180,
    },
    {
      club: clubs[1], // Barcelona
      title: "Umpire - Torneo Juvenil Sala",
      desc: "Indoor youth tournament weekend, several matches. Regional license is enough.",
      level: "AMATEUR",
      licenseLevelRequired: "REGIONAL",
      modality: "INDOOR",
      umpireCategory: "JUVENIL",
      matchDate: daysFromNow(35),
      salary: 90,
    },
    {
      club: clubs[5], // Buenos Aires
      title: "Arbitro Internacional - Clasico Femenino",
      desc: "Women's derby, international license required. Accommodation included.",
      level: "PROFESSIONAL",
      licenseLevelRequired: "INTERNACIONAL",
      modality: "OUTDOOR",
      umpireCategory: "FEMENINO",
      matchDate: daysFromNow(14),
      salary: 250,
    },
    {
      club: clubs[10], // Rotterdam
      title: "Umpire - Veteranos Indoor Cup",
      desc: "Veterans indoor cup, friendly atmosphere. Any license level.",
      level: "AMATEUR",
      licenseLevelRequired: "REGIONAL",
      modality: "INDOOR",
      umpireCategory: "VETERANOS",
      matchDate: daysFromNow(50),
      salary: 70,
    },
    {
      club: clubs[3], // Terrassa
      title: "Umpire - Liga Catalana Femenina",
      desc: "Regional women's league round, two matches in one day. Regional license is enough.",
      level: "AMATEUR",
      licenseLevelRequired: "REGIONAL",
      modality: "OUTDOOR",
      umpireCategory: "FEMENINO",
      matchDate: daysFromNow(28),
      salary: 100,
    },
    {
      club: clubs[6], // Buenos Aires
      title: "Arbitro - Torneo Mayores Metropolitano",
      desc: "Senior men's tournament final. National license required.",
      level: "PROFESSIONAL",
      licenseLevelRequired: "NACIONAL",
      modality: "OUTDOOR",
      umpireCategory: "MAYORES",
      matchDate: daysFromNow(42),
      salary: 160,
    },
  ];

  const umpireJobs = [];
  for (const job of umpireJobData) {
    umpireJobs.push(
      await prisma.jobOpportunity.create({
        data: {
          title: job.title,
          description: job.desc,
          positionType: "UMPIRE",
          level: job.level as any,
          clubId: job.club.id,
          country: job.club.country,
          city: job.club.city,
          salary: job.salary,
          currency: "EUR",
          status: "OPEN",
          licenseLevelRequired: job.licenseLevelRequired as any,
          modality: job.modality as any,
          umpireCategory: job.umpireCategory as any,
          matchDate: job.matchDate,
          benefits: "Travel expenses covered, match fee paid within 7 days",
        },
      }),
    );
  }

  console.log(`✅ Created ${umpireJobs.length} umpire job opportunities\n`);

  // ========== TEST-ACCOUNT ACTIVITY ==========
  // The first player, coach and umpire are the accounts used for manual testing
  // ("My applications", saved jobs, follow counters). Each gets applications in
  // different states, saved jobs and follows to users and to clubs.
  console.log("🧪 Creating activity for the test accounts...");

  const testPlayer = players[0];
  const testCoach = coaches[0];
  const testUmpire = umpires[0];

  const REVIEW_FLOW = ["PENDING", "UNDER_REVIEW", "ACCEPTED", "REJECTED"] as const;
  const apply = async (
    user: { id: string },
    targetJobs: { id: string; clubId: string }[],
    coverLetter: string,
  ) => {
    for (let index = 0; index < targetJobs.length && index < REVIEW_FLOW.length; index++) {
      const status = REVIEW_FLOW[index];
      await prisma.jobApplication.create({
        data: {
          jobOpportunityId: targetJobs[index].id,
          userId: user.id,
          status,
          coverLetter,
          ...(status !== "PENDING" && {
            reviewedAt: new Date(),
            reviewedBy: targetJobs[index].clubId,
            notes: `Reviewed by the club (${status.toLowerCase().replace("_", " ")})`,
          }),
        },
      });
    }
    return targetJobs.slice(0, REVIEW_FLOW.length).map((job) => job.id);
  };
  const saveJobs = async (user: { id: string }, targetJobs: { id: string }[]) => {
    for (const job of targetJobs) {
      await prisma.savedJob.create({ data: { userId: user.id, jobOpportunityId: job.id } });
    }
  };
  const followUser = (follower: { id: string }, target: { id: string }) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followerType: "USER",
        followingId: target.id,
        followingType: "USER",
        followingUserId: target.id,
      },
    });
  const followClub = (follower: { id: string }, club: { id: string }) =>
    prisma.follow.create({
      data: {
        followerId: follower.id,
        followerType: "USER",
        followingId: club.id,
        followingType: "CLUB",
        followingClubId: club.id,
      },
    });

  const playerJobs = jobs.filter((job) => job.positionType === "PLAYER");
  const coachJobs = [
    ...jobs.filter((job) => job.positionType === "COACH"),
    ...jobs.filter((job) => job.positionType === "STAFF"),
  ];

  const playerApplied = await apply(
    testPlayer,
    playerJobs,
    "Motivated and ready to join the squad. Available immediately.",
  );
  const coachApplied = await apply(
    testCoach,
    coachJobs,
    "Licensed coach with years of experience developing players.",
  );
  await apply(
    testUmpire,
    umpireJobs,
    "International license holder with 600+ top-flight matches. Available on the date.",
  );

  // Saved jobs: open jobs the account has not applied to (umpire: the two left)
  const openJobs = jobs.filter((job) => job.status === "OPEN");
  await saveJobs(testPlayer, openJobs.filter((job) => !playerApplied.includes(job.id)).slice(0, 3));
  await saveJobs(testCoach, openJobs.filter((job) => !coachApplied.includes(job.id)).slice(0, 3));
  await saveJobs(testUmpire, umpireJobs.slice(4, 6));

  // Follows to users and to clubs, plus a few back so the counters are not 0
  for (const target of [players[1], players[2], coaches[0]]) await followUser(testPlayer, target);
  for (const target of [clubs[0], clubs[5], clubs[10]]) await followClub(testPlayer, target);
  for (const target of [players[0], coaches[1], umpires[0]]) await followUser(testCoach, target);
  for (const target of [clubs[1], clubs[3]]) await followClub(testCoach, target);
  for (const target of [coaches[0], umpires[1]]) await followUser(testUmpire, target);
  for (const target of [clubs[0], clubs[4], clubs[11]]) await followClub(testUmpire, target);
  await followUser(players[1], testPlayer);
  await followUser(coaches[1], testCoach);
  await followUser(umpires[1], testUmpire);
  // A club account following a person (follower type CLUB, same id as the user)
  await prisma.follow.create({
    data: {
      followerId: clubUsers[0].id,
      followerType: "CLUB",
      followingId: testPlayer.id,
      followingType: "USER",
      followingUserId: testPlayer.id,
    },
  });

  console.log(
    `✅ Test accounts ready: ${testPlayer.email}, ${testCoach.email}, ${testUmpire.email}\n`,
  );

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
        description: `Beginning of my career as a ${POSITION_LABEL[player.position]} - Started playing field hockey at the age of 10.`,
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
        title: POSITION_LABEL[player.position],
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
          title: POSITION_LABEL[player.position],
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
        title: POSITION_LABEL[player.position],
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

  // ========== INTEGRITY CHECKS ==========
  // The DB trigger fills User.clubNameKey for every CLUB account and the unique
  // index rejects repeats; this fails the seed loudly if either is missing.
  const duplicateClubKeys = await prisma.$queryRaw<{ clubNameKey: string; n: bigint }[]>`
    SELECT "clubNameKey", count(*) AS n FROM "User"
    WHERE "role" = 'CLUB' GROUP BY "clubNameKey" HAVING count(*) > 1`;
  if (duplicateClubKeys.length > 0) {
    throw new Error(
      `Two clubs share a clubNameKey: ${duplicateClubKeys.map((row) => row.clubNameKey).join(", ")}`,
    );
  }
  const clubsWithoutKey = await prisma.user.count({
    where: { role: "CLUB", clubNameKey: null },
  });
  if (clubsWithoutKey > 0) {
    throw new Error(`${clubsWithoutKey} CLUB account(s) have no clubNameKey (trigger missing?)`);
  }
  console.log(`✅ ${clubUsers.length} unique club names (clubNameKey)\n`);

  console.log("🎉 Database seeded successfully!\n");
  console.log("📊 Summary:");
  console.log(`   - ${clubs.length} club accounts (User role CLUB + Club)`);
  console.log(`   - broken image URLs (stored as null): ${brokenImageUrls.length}`);
  for (const entry of brokenImageUrls) console.log(`       ${entry}`);
  if (unverifiedImageUrls.length > 0) {
    console.log(
      `   - ${unverifiedImageUrls.length} image URL(s) could not be checked (offline?); kept as is`,
    );
  }
  console.log(`   - 1 super admin`);
  console.log(`   - ${players.length} players`);
  console.log(`   - ${coaches.length} coaches`);
  console.log(`   - ${umpires.length} umpires`);
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
