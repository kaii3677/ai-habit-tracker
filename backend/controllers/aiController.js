import Habit from "../models/habit.js";
import HabitLog from "../models/habitlog.js";
import AIInsight from "../models/AIInsight.js";
import { chatCompletion, SYSTEM_PROMPTS } from "../utils/aiService.js";
import { lastNDays, calcStreak, todayKey } from "../utils/dateHelpers.js";

const buildWeeklyContext = async (userId) => {
    const habits = await Habit.find({ userId, isArchived: false });
    const days = lastNDays(7);
    const logs = await HabitLog.find({
        userId,
        completedDate: { $gte: days[0], $lte: days[days.length - 1]},
    });
    const perHabit = habits.map((h) => {
        const completed = logs.filter(
            (l) => String(l.habitId) === String(h._id)
        ).length;
        return {
            name: h.name, 
            category: h.category,
            frequency: h.frequency,
            completedDays: completed, 
            targetDays: h.targetDays,
        };
    });
    return { days, perHabit };
};

export const weeklyReport = async (req, res) => {
    try{
        const ctx = await buildWeeklyContext(req.user._id);
        if (!ctx.perHabit.length) {
            return res.json({
                content: "You don't have any active habits yet. Create your first habit to start tracking!"
            });
        }
        const userMsg = `Here is the user's habit data for the past 7 days (${ctx.days[0]} to ${ctx.days[6]}):\n\n${ctx.perHabit
            .map(
                (h) => `- ${h.name} (${h.category}, ${h.frequency}): completed ${h.completedDays} of the past 7 days, target ${h.targetDays}/week`
            )
            .join("\n")}\n\nPlease write the personalised weekly report now.`;

        const { content } = await chatCompletion(
            SYSTEM_PROMPTS.weekly,
            userMsg,
        );

        await AIInsight.create({
            userId: req.user._id,
            type: "Weekly",
            content,
        });
        res.json({ content });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const suggestHabits = async (req, res) => {
    try{
        const { goals, productiveTime, struggles } = req.body;
        const userMsg = `User goals: ${goals || "not provided"}\nMost productive time: ${productiveTime || "not provided"}\nPast struggles: ${struggles || "not provided"}\n\nSuggest 3 personalised habits now. Return JSON only. `;
        const { content } = await chatCompletion(
            SYSTEM_PROMPTS.suggestion,
            userMsg,
        );
        let suggestions = [];
        try {
            const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
            suggestions = parsed.suggestions || [];
        } catch {
            suggestions = [];
        }
        if (!suggestions.length) {
            suggestions = [
                {
                    name: "Drink More Water",
                    description: "Drink at least 8 glasses of water throughout the day.",
                    frequency: "Daily",
                    category: "Health",
                    icon: "💧",
                    reason: "Staying hydrated improves energy, concentration, and overall health."
                },
                {
                    name: "Read for 20 Minutes",
                    description: "Spend 20 minutes reading a book or educational material.",
                    frequency: "Daily",
                    category: "Learning",
                    icon: "📚",
                    reason: "Daily reading builds knowledge, improves focus, and encourages continuous learning."
                },
                {
                    name: "Take a 30-Minute Walk",
                    description: "Go for a brisk 30-minute walk outdoors or on a treadmill.",
                    frequency: "Daily",
                    category: "🏃🏻",
                    icon: "directions_walk",
                    reason: "Regular walking supports cardiovascular health, reduces stress, and boosts mood."
                }
            ];
        }
        await AIInsight.create({
            userId: req.user._id,
            type: "Suggestion",
            content: JSON.stringify(suggestions),
            meta: { goals, productiveTime, struggles },
        });
        res.json({suggestions});
    } catch (error){
        res.status(500).json({ message: error.message });
    }
};

export const recoveryPlan = async (req, res) => {
    try {
        const { habitId } = req.body;
        const habit = await Habit.findOne({
            _id: habitId, 
            userId: req.user._id,
        });
        if (!habit) return res.status(404).json({ message: "Habit not found"});

        const logs = await HabitLog.find({
            userId: req.user._id,
            habitId,
        }).sort({
            completedDate: -1
        });

        const keys = logs.map((l) => l.completedDate);
        const { current, longest } = calcStreak(keys);

        const userMsg = `Habit: ${habit.name} (${habit.category}). \nDescription: ${habit.description || "none"}\nCurrent Streak: ${current} days. \n Longest Streak: ${longest} days. The user just broke a streak. Write a warm, actionable 3-day recovery plan. `;

        const { content } = await chatCompletion(
            SYSTEM_PROMPTS.recovery,
            userMsg,
        );
        await AIInsight.create({
            userId: req.user._id,
            type: "Recovery",
            content, 
            meta: { habitId },
        });
        res.json({ content }); 
    } catch (err) {
        res.status(500).json({message: err.message});
    }
};

export const chatAnalysis = async (req, res) => {
    try{
        const { question } = req.body;
        if (!question)
            return res.status(400).json({ message: "Question is required"});

        const habits = await Habit.find({
            userId: req.user._id,
            isArchived: false,
        });
        const days = lastNDays(30);
        const logs = await HabitLog.find({
            userId: req.user._id,
            completedDate: { $gte: days[0], $lte: days[days.length - 1] },
        });

        const context = habits.map((h) => {
            const hLogs = logs.filter(
                (l) => String(l.habitId) === String(h._id)
            );
            const byDow = [0,0,0,0,0,0,0];
            for (const l of hLogs) {
                const dow = new Date(l.completedDate).getDay();
                byDow[dow] += 1;
            }
            return `${h.name} (${h.category}): ${hLogs.length}/30 in last 30 days, by weekday [Sun, Mon, Tue, Wed, Thu, Fri, Sat]: [${byDow.join(", ")}]`;
        }).join("\n");

        const userMsg = `User question: "${question}"\n\nUser data (last 30 days):\n${context}\n\nAnswer now.`;
        const { content } = await chatCompletion(
            SYSTEM_PROMPTS.chat,
            userMsg,
        );
        await AIInsight.create({
            userId: req.user._id,
            type:"Chat",
            content, 
            meta: { question },
        });
        res.json({ content });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

export const morningMotivation = async (req, res) => {
    try{
        const habits = await Habit.find({
            userId: req.user._id,
            isArchived: false, 
        });
        if (!habits.length) {
            return res.json({
                content: "Good Morning! Add your first habit today and let's get the momentum started.",
            });
        }

        const days = lastNDays(30);
        const logs = await HabitLog.find({
            userId: req.user._id,
            completedDate: { $gte: days[0], $lte: days[days.length - 1]},
        });

        const ctx = habits.map((h) => {
            const hLogs = logs.filter((l) => String(l.habitId) === String(h._id))
            .map((l) => l.completedDate).sort().reverse();
            const { current } = calcStreak(hLogs);
            return `${h.name}: current streak ${current}`;
        }).join("\n");

        const today = todayKey();
        const todayLog = logs.filter((l) => l.completedDate === today);
        const done = todayLog.length;
        const total = habits.length;

        const userMsg = `Today's habits and streaks:\n${ctx}\n\nDone today: ${done}/${total}. Write the morning motivation.`

        const { content } = await chatCompletion(
            SYSTEM_PROMPTS.morning,
            userMsg,
            0.8,
        );
        await AIInsight.create({
            userId: req.user._id,
            type: "Morning",
            content,
        });
        res.json({ content });
    } catch (error ){
        res.status(500).json({ message : error.message });
    }
};

