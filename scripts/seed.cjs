const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://tzrsypzpeurtqbepvptl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * The assessment expects 24 months of slightly messy operational history.
 * We keep the generator close to the provided starter script so later AI
 * prompts line up with the seeded anomalies.
 */
function getRandomDate(monthsAgo) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(Math.floor(Math.random() * 28) + 1);
  return date.toISOString();
}

async function clearTable(supabase, table) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) {
    throw new Error(`Failed clearing ${table}: ${error.message}`);
  }
}

async function insertOne(supabase, table, payload) {
  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    throw new Error(`Insert error for ${table}: ${error.message}`);
  }
}

async function seed() {
  console.log("Starting RI demo seed...");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  await clearTable(supabase, "expenses");
  await clearTable(supabase, "revenue");
  await clearTable(supabase, "projects");
  await clearTable(supabase, "users");
  await clearTable(supabase, "organizations");

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .insert([{ name: "7-Eleven Global" }, { name: "Home Depot Field Ops" }])
    .select();
  if (orgErr || !orgs) {
    throw new Error(`Org error: ${orgErr?.message}`);
  }

  const org711 = orgs.find((org) => org.name === "7-Eleven Global");
  const orgHD = orgs.find((org) => org.name === "Home Depot Field Ops");
  if (!org711 || !orgHD) {
    throw new Error("Expected seeded organizations were not returned");
  }

  const { data: techs, error: techErr } = await supabase
    .from("users")
    .insert([
      {
        org_id: org711.id,
        full_name: "Marcus Thorne",
        email: "m.thorne@field.com",
        role: "technician"
      },
      {
        org_id: org711.id,
        full_name: "Sarah Miller",
        email: "s.miller@field.com",
        role: "technician"
      },
      {
        org_id: orgHD.id,
        full_name: "David Chen",
        email: "d.chen@field.com",
        role: "technician"
      },
      {
        org_id: orgHD.id,
        full_name: "Aisha Patel",
        email: "a.patel@field.com",
        role: "technician"
      }
    ])
    .select();
  if (techErr || !techs) {
    throw new Error(`User error: ${techErr?.message}`);
  }

  const { data: projects, error: projectErr } = await supabase
    .from("projects")
    .insert([
      {
        org_id: org711.id,
        name: "Store #24051 - Austin, TX",
        budget: 150000
      },
      {
        org_id: org711.id,
        name: "Store #39201 - Denver, CO",
        budget: 135000
      },
      {
        org_id: orgHD.id,
        name: "HD #1102 - Seattle, WA",
        budget: 220000
      },
      {
        org_id: orgHD.id,
        name: "HD #0899 - Miami, FL",
        budget: 210000
      }
    ])
    .select();
  if (projectErr || !projects) {
    throw new Error(`Project error: ${projectErr?.message}`);
  }

  for (let monthOffset = 23; monthOffset >= 0; monthOffset -= 1) {
    const inflationMultiplier = monthOffset < 12 ? 1.15 : 1.0;

    for (const project of projects) {
      const validTechs = techs.filter((tech) => tech.org_id === project.org_id);
      const activeTech =
        validTechs[Math.floor(Math.random() * validTechs.length)];
      const surveyDate = getRandomDate(monthOffset);
      const baseFee = project.org_id === orgHD.id ? 12500 : 8500;

      await insertOne(supabase, "revenue", {
        project_id: project.id,
        amount: baseFee + Math.floor(Math.random() * 1000),
        description: "Monthly Lidar & Imaging Survey",
        date: surveyDate
      });

      const tripExpenses = [
        {
          category: "Flight",
          amount: (350 + Math.random() * 250) * inflationMultiplier
        },
        {
          category: "Hotel",
          amount: (400 + Math.random() * 300) * inflationMultiplier
        },
        {
          category: "Meals",
          amount: (150 + Math.random() * 100) * inflationMultiplier
        },
        {
          category: "Equipment",
          amount: 200
        }
      ];

      for (const item of tripExpenses) {
        let finalAmount = item.amount;
        let finalCategory = item.category;

        if (
          activeTech.full_name === "Marcus Thorne" &&
          monthOffset === 8 &&
          item.category === "Equipment"
        ) {
          finalAmount = 7500;
          finalCategory = "Unauthorized Hardware Purchase";
        }

        if (
          activeTech.full_name === "Aisha Patel" &&
          monthOffset === 3 &&
          item.category === "Flight"
        ) {
          await insertOne(supabase, "expenses", {
            project_id: project.id,
            user_id: activeTech.id,
            amount: Number(finalAmount.toFixed(2)),
            category: "Flight",
            date: surveyDate
          });
        }

        await insertOne(supabase, "expenses", {
          project_id: project.id,
          user_id: activeTech.id,
          amount: Number(finalAmount.toFixed(2)),
          category: finalCategory,
          date: surveyDate
        });
      }
    }
  }

  const totalRevenue = await supabase
    .from("revenue")
    .select("*", { count: "exact", head: true });
  const totalExpenses = await supabase
    .from("expenses")
    .select("*", { count: "exact", head: true });

  console.log(
    `Seed complete: ${projects.length} projects, ${totalRevenue.count ?? 0} revenue rows, ${totalExpenses.count ?? 0} expense rows`
  );
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
