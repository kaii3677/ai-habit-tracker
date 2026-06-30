import "dotenv/config";
import mongoose from "mongoose";
import { format, subDays } from "date-fns";
import { connectDB } from "../config/db.js";
import User from "../models/user.js";
import Habit from "../models/habit.js";
import HabitLog from "../models/habitlog.js";
import AIInsight from "../models/AIInsight.js";

const EMAIL = "sample@email.com";
const PASSWORD = "sample123";
const NAME = "John Doe";

const HABITS = [
    {
      name: "Drink 2L of Water",
      description: "Stay hydrated by drinking at least 2 liters of water.",
      category: "Health",
      frequency: "daily",
      targetDays: 7,
      color: "#3b82f6",
      icon: "💧",
      _streakProb: 0.9
    },
    {
      name: "Read 20 Pages",
      description: "Read at least 20 pages of a book to build a reading habit.",
      category: "Learning",
      frequency: "daily",
      targetDays: 6,
      color: "#8b5cf6",
      icon: "📚",
      _streakProb: 0.75,
      _brokeAt: 20
    },
    {
      name: "Morning Run",
      description: "Go for a 30-minute jog or run to stay active.",
      category: "Fitness",
      frequency: "daily",
      targetDays: 5,
      color: "#22c55e",
      icon: "🏃",
      _streakProb: 0.65
    },
    {
      name: "Meditate",
      description: "Practice mindfulness meditation for 10 minutes.",
      category: "Personal Growth",
      frequency: "daily",
      targetDays: 7,
      color: "#f59e0b",
      icon: "🧘",
      _streakProb: 0.8
    },
    {
      name: "Practice Coding",
      description: "Spend at least 1 hour solving coding problems or building projects.",
      category: "Productivity",
      frequency: "daily",
      targetDays: 5,
      color: "#ef4444",
      icon: "💻",
      _streakProb: 0.7
    }
  ];

const todayKey = () => format(new Date(), "yyyy-MM-dd");

const buildLogs = (habit, totalDays = 90) => {
    const logs = [];
    const today = new Date();
    for (let i = 0; i < totalDays; i++){
        const d = subDays(today, i);
        const dow = d.getDay();
        const key = format(d, "yyyy-MM-dd");
        let p = habit._streakProb;

        if (habit._pattern === "weekdays") {
            if (dow === 0 || dow === 6) p *= 0.35;
        }
        if (habit._pattern === "dropoff") {
            if (i < 14) p *= 0.25;
        }

        if (habit._brokeAt && i >= habit._brokeAt - 2 && i <= habit._brokeAt + 2){
            continue;
        }

        const seed = Math.sin(i * 9301 + habit.name.length * 49297) * 233280;
        const rnd = seed - Math.floor(seed);
        if (rnd < p) logs.push({ completedDate: key });
    }
    return logs;
};

const run = async () => { 
    await connectDB();

    let user = await User.findOne({ email: EMAIL });
    if (user) {
        console.log(`Found existing user ${EMAIL} - clearing their data...`);
        await Habit.deleteMany({ userId: user._id });
        await HabitLog.deleteMany({ userId: user._id });
        await AIInsight.deleteMany({ userId: user._id });
        user.name = NAME;
        user.avatar = NAME.charAt(0).toUpperCase();
        user.morningMotivation = true;
        user.password = PASSWORD;
        await user.save();
    } else {
        user = await User.create({
            name: NAME, 
            email: EMAIL,
            password: PASSWORD,
            avatar: NAME.charAt(0).toUpperCase(),
            morningMotivation: true,
        });
        console.log(`Created user ${EMAIL}`);
    }
    const createdHabits = [];
    for ( let i = 0; i < HABITS.length; i++){
        const h = HABITS[i];
        const habit = await Habit.create({
            userId: user._id,
            name: h.name,
            description: h.description,
            category: h.category,
            frequency: h.frequency,
            targetDays: h.targetDays,
            color: h.color,
            icon: h.icon, 
            order: i,
            createdAt: subDays(new Date(), 89),
            updatedAt: subDays(new Date(), 89),
        });
        habit.createdAt = subDays(new Date(), 89);
        await habit.save({ timestamps: false });
        createdHabits.push({ habit, config: h});
    }

    let totalLogs = 0;
    for (const { habit, config } of createdHabits) {
        const logs = buildLogs(config);
        if (!logs.length) continue;
        const docs = logs.map((l) => ({
            userId: user._id,
            habitId: habit._id, 
            completedDate: l.completedDate,
        }));
        await HabitLog.insertMany(docs, { ordered: false }).catch(() => {});
        totalLogs += docs.length;
    }

    const today = todayKey();
    const todayDoneHabits = createdHabits.slice(0, 4).map((c) => c.habit);
    for (const h of todayDoneHabits ){
        await HabitLog.updateOne(
            { userId: user._id, habitId: h._id, completedDate: today },
            { $setOnInsert: { userId: user._id, habitId: h._id, completedDate: today}},
            { upsert: true }
        );
    }
    console.log("Seed complete");
    console.log(`User: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`Habits: ${createdHabits.length}`);
    console.log(`Logs: ~${totalLogs}`);
    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error("Seed failed: ", err);
    await mongoose.disconnect();
    process.exit(1);
});