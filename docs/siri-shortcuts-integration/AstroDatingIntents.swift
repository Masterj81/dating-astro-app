import AppIntents
import Foundation

// MARK: - App Shortcuts Provider

/// Provides the available shortcuts for AstroDating in the Shortcuts app
@available(iOS 16.0, *)
struct AstroDatingShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CheckHoroscopeIntent(),
            phrases: [
                "Check my horoscope in \(.applicationName)",
                "What's my horoscope on \(.applicationName)",
                "Show my daily horoscope in \(.applicationName)",
                "Read my horoscope from \(.applicationName)"
            ],
            shortTitle: "Check Horoscope",
            systemImageName: "sparkles"
        )

        AppShortcut(
            intent: ViewMatchesIntent(),
            phrases: [
                "Show my matches in \(.applicationName)",
                "View matches on \(.applicationName)",
                "Who matched with me on \(.applicationName)",
                "Open my matches in \(.applicationName)"
            ],
            shortTitle: "View Matches",
            systemImageName: "heart.fill"
        )

        AppShortcut(
            intent: CheckCompatibilityIntent(),
            phrases: [
                "Check compatibility with \(\.$zodiacSign) in \(.applicationName)",
                "How compatible am I with \(\.$zodiacSign) on \(.applicationName)",
                "What's my compatibility with \(\.$zodiacSign) in \(.applicationName)"
            ],
            shortTitle: "Check Compatibility",
            systemImageName: "star.fill"
        )
    }
}

// MARK: - Check Horoscope Intent

/// Intent to check the user's daily horoscope
@available(iOS 16.0, *)
struct CheckHoroscopeIntent: AppIntent {
    static var title: LocalizedStringResource = "Check My Horoscope"
    static var description = IntentDescription("Get your personalized daily horoscope reading")

    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        // Get user's sun sign from shared storage
        let userDefaults = UserDefaults(suiteName: "group.com.astrodating.app")
        let sunSign = userDefaults?.string(forKey: "userSunSign") ?? "Aries"

        // Get today's horoscope (in a real app, this would fetch from API)
        let horoscope = getHoroscopeForSign(sunSign)

        return .result(
            dialog: "Here's your \(sunSign) horoscope for today",
            view: HoroscopeSnippetView(sign: sunSign, horoscope: horoscope)
        )
    }

    private func getHoroscopeForSign(_ sign: String) -> String {
        // In production, this would fetch from the API
        // For now, return a placeholder that indicates the app should be opened
        let horoscopes: [String: String] = [
            "Aries": "Today brings exciting opportunities for new beginnings. Your energy is high and others are drawn to your enthusiasm.",
            "Taurus": "Focus on stability and comfort today. Financial matters may require your attention, but trust your instincts.",
            "Gemini": "Communication is key today. Your quick wit and charm open doors. Stay curious and embrace new ideas.",
            "Cancer": "Emotional connections deepen today. Trust your intuition when it comes to matters of the heart.",
            "Leo": "Your creative energy shines bright. Take center stage and let your natural leadership guide others.",
            "Virgo": "Details matter today. Your analytical mind helps solve complex problems. Health routines bring benefits.",
            "Libra": "Balance and harmony are your focus. Relationships flourish when you find the middle ground.",
            "Scorpio": "Transformation is in the air. Deep insights emerge. Trust the process of change.",
            "Sagittarius": "Adventure calls! Expand your horizons through learning or travel. Optimism leads the way.",
            "Capricorn": "Career ambitions get a boost. Your disciplined approach pays off. Stay focused on long-term goals.",
            "Aquarius": "Innovation sparks today. Your unique perspective brings fresh solutions. Community matters.",
            "Pisces": "Intuition is heightened. Creative pursuits bring joy. Dreams may hold important messages."
        ]

        return horoscopes[sign] ?? "The stars have aligned for a wonderful day ahead. Trust in the cosmic energy surrounding you."
    }
}

// MARK: - View Matches Intent

/// Intent to view the user's matches
@available(iOS 16.0, *)
struct ViewMatchesIntent: AppIntent {
    static var title: LocalizedStringResource = "View My Matches"
    static var description = IntentDescription("See your cosmic connections and matches")

    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        // This intent opens the app to the matches tab
        // The deep link will be handled by the app
        return .result()
    }
}

// MARK: - Check Compatibility Intent

/// Intent to check compatibility with a zodiac sign
@available(iOS 16.0, *)
struct CheckCompatibilityIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Compatibility"
    static var description = IntentDescription("Check your astrological compatibility with any zodiac sign")

    @Parameter(title: "Zodiac Sign")
    var zodiacSign: ZodiacSignEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Check compatibility with \(\.$zodiacSign)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        // Get user's sun sign from shared storage
        let userDefaults = UserDefaults(suiteName: "group.com.astrodating.app")
        let userSign = userDefaults?.string(forKey: "userSunSign") ?? "Aries"

        // Calculate compatibility
        let score = calculateCompatibility(userSign: userSign, partnerSign: zodiacSign.name)
        let description = getCompatibilityDescription(score: score)

        return .result(
            dialog: "Your compatibility with \(zodiacSign.name) is \(score)%. \(description)"
        )
    }

    private func calculateCompatibility(userSign: String, partnerSign: String) -> Int {
        // Element-based compatibility calculation
        let elements: [String: String] = [
            "Aries": "Fire", "Leo": "Fire", "Sagittarius": "Fire",
            "Taurus": "Earth", "Virgo": "Earth", "Capricorn": "Earth",
            "Gemini": "Air", "Libra": "Air", "Aquarius": "Air",
            "Cancer": "Water", "Scorpio": "Water", "Pisces": "Water"
        ]

        let userElement = elements[userSign] ?? "Fire"
        let partnerElement = elements[partnerSign] ?? "Fire"

        // Same element = high compatibility
        if userElement == partnerElement {
            return Int.random(in: 85...98)
        }

        // Compatible elements
        let compatible: [String: [String]] = [
            "Fire": ["Air"],
            "Air": ["Fire"],
            "Earth": ["Water"],
            "Water": ["Earth"]
        ]

        if compatible[userElement]?.contains(partnerElement) == true {
            return Int.random(in: 70...89)
        }

        // Less compatible
        return Int.random(in: 45...69)
    }

    private func getCompatibilityDescription(score: Int) -> String {
        switch score {
        case 90...100:
            return "A cosmic soulmate connection! The stars shine brightly on this pairing."
        case 75...89:
            return "Excellent compatibility! You complement each other beautifully."
        case 60...74:
            return "Good potential! With understanding, this connection can flourish."
        case 45...59:
            return "Interesting dynamics at play. Differences can spark growth."
        default:
            return "A unique pairing that offers opportunities for learning."
        }
    }
}

// MARK: - Zodiac Sign Entity

/// Entity representing a zodiac sign for use in Siri Shortcuts
@available(iOS 16.0, *)
struct ZodiacSignEntity: AppEntity {
    var id: String
    var name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Zodiac Sign")
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }

    static var defaultQuery = ZodiacSignQuery()
}

@available(iOS 16.0, *)
struct ZodiacSignQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ZodiacSignEntity] {
        return identifiers.compactMap { id in
            ZodiacSignEntity.allSigns.first { $0.id == id }
        }
    }

    func suggestedEntities() async throws -> [ZodiacSignEntity] {
        return ZodiacSignEntity.allSigns
    }
}

@available(iOS 16.0, *)
extension ZodiacSignEntity {
    static let allSigns: [ZodiacSignEntity] = [
        ZodiacSignEntity(id: "aries", name: "Aries"),
        ZodiacSignEntity(id: "taurus", name: "Taurus"),
        ZodiacSignEntity(id: "gemini", name: "Gemini"),
        ZodiacSignEntity(id: "cancer", name: "Cancer"),
        ZodiacSignEntity(id: "leo", name: "Leo"),
        ZodiacSignEntity(id: "virgo", name: "Virgo"),
        ZodiacSignEntity(id: "libra", name: "Libra"),
        ZodiacSignEntity(id: "scorpio", name: "Scorpio"),
        ZodiacSignEntity(id: "sagittarius", name: "Sagittarius"),
        ZodiacSignEntity(id: "capricorn", name: "Capricorn"),
        ZodiacSignEntity(id: "aquarius", name: "Aquarius"),
        ZodiacSignEntity(id: "pisces", name: "Pisces")
    ]
}

// MARK: - Horoscope Snippet View

import SwiftUI

@available(iOS 16.0, *)
struct HoroscopeSnippetView: View {
    let sign: String
    let horoscope: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(signEmoji)
                    .font(.largeTitle)
                Text(sign)
                    .font(.headline)
                    .foregroundColor(.primary)
            }

            Text(horoscope)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(4)

            Text("Open AstroDating for full reading")
                .font(.caption)
                .foregroundColor(.accentColor)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
    }

    private var signEmoji: String {
        let emojis: [String: String] = [
            "Aries": "♈️",
            "Taurus": "♉️",
            "Gemini": "♊️",
            "Cancer": "♋️",
            "Leo": "♌️",
            "Virgo": "♍️",
            "Libra": "♎️",
            "Scorpio": "♏️",
            "Sagittarius": "♐️",
            "Capricorn": "♑️",
            "Aquarius": "♒️",
            "Pisces": "♓️"
        ]
        return emojis[sign] ?? "✨"
    }
}
