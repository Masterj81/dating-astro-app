import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Data Models

struct HoroscopeEntry: TimelineEntry {
    let date: Date
    let sunSign: String
    let sunEmoji: String
    let moonPhase: String
    let moonEmoji: String
    let dailyMessage: String
    let luckyNumber: Int
    let energyPercent: Int
    let configuration: ConfigurationAppIntent
}

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Daily Horoscope"
    static var description = IntentDescription("View your daily horoscope")
}

// MARK: - Zodiac Data

struct ZodiacSign {
    let name: String
    let emoji: String
    let element: String
    let messages: [String]
}

let zodiacSigns: [String: ZodiacSign] = [
    "aries": ZodiacSign(name: "Aries", emoji: "♈", element: "fire", messages: [
        "Your fiery energy attracts positive opportunities today.",
        "Bold moves lead to exciting discoveries.",
        "Trust your instincts - they're aligned with the stars."
    ]),
    "taurus": ZodiacSign(name: "Taurus", emoji: "♉", element: "earth", messages: [
        "Stability brings unexpected rewards today.",
        "Your patience will be rewarded soon.",
        "Ground yourself and watch abundance flow."
    ]),
    "gemini": ZodiacSign(name: "Gemini", emoji: "♊", element: "air", messages: [
        "Communication opens new doors today.",
        "Your curiosity leads to meaningful connections.",
        "Express yourself freely - others are listening."
    ]),
    "cancer": ZodiacSign(name: "Cancer", emoji: "♋", element: "water", messages: [
        "Emotional intuition guides you to the right path.",
        "Nurturing connections bring joy today.",
        "Trust your feelings - they reveal hidden truths."
    ]),
    "leo": ZodiacSign(name: "Leo", emoji: "♌", element: "fire", messages: [
        "Your natural charisma shines brightly today.",
        "Creative expression brings fulfillment.",
        "Step into the spotlight - it's your time."
    ]),
    "virgo": ZodiacSign(name: "Virgo", emoji: "♍", element: "earth", messages: [
        "Attention to detail yields impressive results.",
        "Your analytical mind solves complex puzzles.",
        "Organization creates space for romance."
    ]),
    "libra": ZodiacSign(name: "Libra", emoji: "♎", element: "air", messages: [
        "Harmony flows through all your interactions.",
        "Balance brings peace and clarity today.",
        "Beauty surrounds you - embrace it fully."
    ]),
    "scorpio": ZodiacSign(name: "Scorpio", emoji: "♏", element: "water", messages: [
        "Deep connections intensify under today's stars.",
        "Transformation opens new possibilities.",
        "Your magnetic presence draws others in."
    ]),
    "sagittarius": ZodiacSign(name: "Sagittarius", emoji: "♐", element: "fire", messages: [
        "Adventure awaits around every corner.",
        "Your optimism inspires those around you.",
        "Expand your horizons - fortune favors the bold."
    ]),
    "capricorn": ZodiacSign(name: "Capricorn", emoji: "♑", element: "earth", messages: [
        "Your determination moves mountains today.",
        "Success rewards your consistent efforts.",
        "Build with intention - lasting love awaits."
    ]),
    "aquarius": ZodiacSign(name: "Aquarius", emoji: "♒", element: "air", messages: [
        "Innovative ideas spark exciting conversations.",
        "Your unique perspective attracts kindred spirits.",
        "Embrace your authenticity - it's magnetic."
    ]),
    "pisces": ZodiacSign(name: "Pisces", emoji: "♓", element: "water", messages: [
        "Dreams carry messages from the universe.",
        "Your intuition guides you to true connection.",
        "Creative flow brings emotional harmony."
    ])
]

// MARK: - Moon Phase Calculator

func getMoonPhase() -> (emoji: String, name: String) {
    let phases = [
        ("🌑", "New Moon"),
        ("🌒", "Waxing Crescent"),
        ("🌓", "First Quarter"),
        ("🌔", "Waxing Gibbous"),
        ("🌕", "Full Moon"),
        ("🌖", "Waning Gibbous"),
        ("🌗", "Last Quarter"),
        ("🌘", "Waning Crescent")
    ]
    let dayOfMonth = Calendar.current.component(.day, from: Date())
    let phaseIndex = (dayOfMonth / 4) % 8
    return phases[phaseIndex]
}

// MARK: - Data Provider

func getUserSunSign() -> String {
    let defaults = UserDefaults(suiteName: "group.com.astrodating.app")
    return defaults?.string(forKey: "userSunSign") ?? "aries"
}

func getLuckyNumber(for sign: String) -> Int {
    let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 1
    let signHash = sign.hashValue
    return ((abs(signHash) + dayOfYear) % 90) + 1
}

func getEnergyPercent(for sign: String) -> Int {
    let dayOfMonth = Calendar.current.component(.day, from: Date())
    let baseEnergy = 70
    let variation = (sign.hashValue + dayOfMonth) % 25
    return min(95, baseEnergy + variation)
}

// MARK: - Timeline Provider

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> HoroscopeEntry {
        let moonPhase = getMoonPhase()
        return HoroscopeEntry(
            date: Date(),
            sunSign: "Aries",
            sunEmoji: "♈",
            moonPhase: moonPhase.name,
            moonEmoji: moonPhase.emoji,
            dailyMessage: "Your cosmic journey awaits...",
            luckyNumber: 7,
            energyPercent: 85,
            configuration: ConfigurationAppIntent()
        )
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> HoroscopeEntry {
        return createEntry(for: configuration)
    }

    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<HoroscopeEntry> {
        let entry = createEntry(for: configuration)

        // Update at midnight
        let calendar = Calendar.current
        let tomorrow = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: Date())!)

        return Timeline(entries: [entry], policy: .after(tomorrow))
    }

    private func createEntry(for configuration: ConfigurationAppIntent) -> HoroscopeEntry {
        let sunSignKey = getUserSunSign().lowercased()
        let zodiac = zodiacSigns[sunSignKey] ?? zodiacSigns["aries"]!
        let moonPhase = getMoonPhase()
        let dayOfYear = Calendar.current.ordinality(of: .day, in: .year, for: Date()) ?? 0
        let messageIndex = dayOfYear % zodiac.messages.count

        return HoroscopeEntry(
            date: Date(),
            sunSign: zodiac.name,
            sunEmoji: zodiac.emoji,
            moonPhase: moonPhase.name,
            moonEmoji: moonPhase.emoji,
            dailyMessage: zodiac.messages[messageIndex],
            luckyNumber: getLuckyNumber(for: sunSignKey),
            energyPercent: getEnergyPercent(for: sunSignKey),
            configuration: configuration
        )
    }
}

// MARK: - Widget Views

struct SmallWidgetView: View {
    var entry: HoroscopeEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(entry.sunEmoji)
                    .font(.title2)
                Text(entry.sunSign)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Spacer()
                Text(entry.moonEmoji)
                    .font(.title3)
            }

            Text(entry.dailyMessage)
                .font(.caption)
                .foregroundColor(.white.opacity(0.9))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            HStack {
                Label("\(entry.luckyNumber)", systemImage: "star.fill")
                    .font(.caption2)
                    .foregroundColor(.purple)
                Spacer()
                Text("\(entry.energyPercent)%")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(.pink)
            }
        }
        .padding()
        .background(
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.06, green: 0.06, blue: 0.10),
                    Color(red: 0.10, green: 0.10, blue: 0.18),
                    Color(red: 0.09, green: 0.13, blue: 0.24)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

struct MediumWidgetView: View {
    var entry: HoroscopeEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left: Sign info
            VStack(alignment: .center, spacing: 4) {
                Text(entry.sunEmoji)
                    .font(.system(size: 44))
                Text(entry.sunSign)
                    .font(.headline)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                HStack(spacing: 4) {
                    Text(entry.moonEmoji)
                        .font(.caption)
                    Text(entry.moonPhase)
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .frame(width: 80)

            // Right: Message and stats
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.dailyMessage)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.95))
                    .lineLimit(3)

                Spacer()

                HStack(spacing: 16) {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .foregroundColor(.yellow)
                            .font(.caption2)
                        Text("Lucky: \(entry.luckyNumber)")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.8))
                    }

                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .foregroundColor(.pink)
                            .font(.caption2)
                        Text("Energy: \(entry.energyPercent)%")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.8))
                    }
                }
            }
        }
        .padding()
        .background(
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.06, green: 0.06, blue: 0.10),
                    Color(red: 0.10, green: 0.10, blue: 0.18),
                    Color(red: 0.09, green: 0.13, blue: 0.24)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

struct LargeWidgetView: View {
    var entry: HoroscopeEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text(entry.sunEmoji)
                    .font(.largeTitle)
                VStack(alignment: .leading) {
                    Text(entry.sunSign)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    Text("Daily Horoscope")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(entry.moonEmoji)
                        .font(.title2)
                    Text(entry.moonPhase)
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.7))
                }
            }

            Divider()
                .background(Color.white.opacity(0.2))

            // Message
            Text(entry.dailyMessage)
                .font(.body)
                .foregroundColor(.white.opacity(0.95))
                .lineLimit(4)

            Spacer()

            // Stats row
            HStack(spacing: 20) {
                // Lucky Number
                VStack(spacing: 4) {
                    Image(systemName: "star.fill")
                        .foregroundColor(.yellow)
                        .font(.title3)
                    Text("\(entry.luckyNumber)")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Lucky")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)

                // Energy
                VStack(spacing: 4) {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(.pink)
                        .font(.title3)
                    Text("\(entry.energyPercent)%")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Energy")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)

                // Moon
                VStack(spacing: 4) {
                    Text(entry.moonEmoji)
                        .font(.title3)
                    Text(entry.moonPhase.split(separator: " ").first.map(String.init) ?? "Moon")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Phase")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.05))
            .cornerRadius(12)

            // Tap hint
            HStack {
                Spacer()
                Text("Tap for full reading")
                    .font(.caption2)
                    .foregroundColor(.purple)
                Image(systemName: "arrow.right")
                    .font(.caption2)
                    .foregroundColor(.purple)
            }
        }
        .padding()
        .background(
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.06, green: 0.06, blue: 0.10),
                    Color(red: 0.10, green: 0.10, blue: 0.18),
                    Color(red: 0.09, green: 0.13, blue: 0.24)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

// MARK: - Widget Entry View

struct AstroDatingWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: Provider.Entry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Widget Definition

struct AstroDatingWidget: Widget {
    let kind: String = "AstroDatingWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: ConfigurationAppIntent.self,
            provider: Provider()
        ) { entry in
            AstroDatingWidgetEntryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Daily Horoscope")
        .description("See your daily horoscope at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Widget Bundle

@main
struct AstroDatingWidgetBundle: WidgetBundle {
    var body: some Widget {
        AstroDatingWidget()
    }
}

// MARK: - Preview

#Preview(as: .systemSmall) {
    AstroDatingWidget()
} timeline: {
    let moonPhase = getMoonPhase()
    HoroscopeEntry(
        date: Date(),
        sunSign: "Leo",
        sunEmoji: "♌",
        moonPhase: moonPhase.name,
        moonEmoji: moonPhase.emoji,
        dailyMessage: "Your natural charisma shines brightly today.",
        luckyNumber: 14,
        energyPercent: 87,
        configuration: ConfigurationAppIntent()
    )
}

#Preview(as: .systemMedium) {
    AstroDatingWidget()
} timeline: {
    let moonPhase = getMoonPhase()
    HoroscopeEntry(
        date: Date(),
        sunSign: "Scorpio",
        sunEmoji: "♏",
        moonPhase: moonPhase.name,
        moonEmoji: moonPhase.emoji,
        dailyMessage: "Deep connections intensify under today's stars. Your magnetic presence draws others in.",
        luckyNumber: 23,
        energyPercent: 92,
        configuration: ConfigurationAppIntent()
    )
}
