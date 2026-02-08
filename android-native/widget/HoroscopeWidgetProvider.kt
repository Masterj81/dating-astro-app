package com.astrodating.app.widget

import com.astrodating.app.R
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.util.Calendar

/**
 * AstroDating Horoscope Widget Provider
 * Displays daily horoscope information on the home screen
 */
class HoroscopeWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onEnabled(context: Context) {
        // Called when the first widget is created
    }

    override fun onDisabled(context: Context) {
        // Called when the last widget is removed
    }

    companion object {
        private val zodiacSigns = mapOf(
            "aries" to ZodiacSign("Aries", "♈", listOf(
                "Your fiery energy attracts positive opportunities today.",
                "Bold moves lead to exciting discoveries.",
                "Trust your instincts - they're aligned with the stars."
            )),
            "taurus" to ZodiacSign("Taurus", "♉", listOf(
                "Stability brings unexpected rewards today.",
                "Your patience will be rewarded soon.",
                "Ground yourself and watch abundance flow."
            )),
            "gemini" to ZodiacSign("Gemini", "♊", listOf(
                "Communication opens new doors today.",
                "Your curiosity leads to meaningful connections.",
                "Express yourself freely - others are listening."
            )),
            "cancer" to ZodiacSign("Cancer", "♋", listOf(
                "Emotional intuition guides you to the right path.",
                "Nurturing connections bring joy today.",
                "Trust your feelings - they reveal hidden truths."
            )),
            "leo" to ZodiacSign("Leo", "♌", listOf(
                "Your natural charisma shines brightly today.",
                "Creative expression brings fulfillment.",
                "Step into the spotlight - it's your time."
            )),
            "virgo" to ZodiacSign("Virgo", "♍", listOf(
                "Attention to detail yields impressive results.",
                "Your analytical mind solves complex puzzles.",
                "Organization creates space for romance."
            )),
            "libra" to ZodiacSign("Libra", "♎", listOf(
                "Harmony flows through all your interactions.",
                "Balance brings peace and clarity today.",
                "Beauty surrounds you - embrace it fully."
            )),
            "scorpio" to ZodiacSign("Scorpio", "♏", listOf(
                "Deep connections intensify under today's stars.",
                "Transformation opens new possibilities.",
                "Your magnetic presence draws others in."
            )),
            "sagittarius" to ZodiacSign("Sagittarius", "♐", listOf(
                "Adventure awaits around every corner.",
                "Your optimism inspires those around you.",
                "Expand your horizons - fortune favors the bold."
            )),
            "capricorn" to ZodiacSign("Capricorn", "♑", listOf(
                "Your determination moves mountains today.",
                "Success rewards your consistent efforts.",
                "Build with intention - lasting love awaits."
            )),
            "aquarius" to ZodiacSign("Aquarius", "♒", listOf(
                "Innovative ideas spark exciting conversations.",
                "Your unique perspective attracts kindred spirits.",
                "Embrace your authenticity - it's magnetic."
            )),
            "pisces" to ZodiacSign("Pisces", "♓", listOf(
                "Dreams carry messages from the universe.",
                "Your intuition guides you to true connection.",
                "Creative flow brings emotional harmony."
            ))
        )

        private val moonPhases = listOf(
            "🌑" to "New Moon",
            "🌒" to "Waxing Crescent",
            "🌓" to "First Quarter",
            "🌔" to "Waxing Gibbous",
            "🌕" to "Full Moon",
            "🌖" to "Waning Gibbous",
            "🌗" to "Last Quarter",
            "🌘" to "Waning Crescent"
        )

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)

            // Get user's sun sign from SharedPreferences
            val prefs = context.getSharedPreferences("group.com.astrodating.app", Context.MODE_PRIVATE)
            val sunSignKey = prefs.getString("userSunSign", "aries")?.lowercase() ?: "aries"
            val zodiac = zodiacSigns[sunSignKey] ?: zodiacSigns["aries"]!!

            // Get daily message based on day of year
            val calendar = Calendar.getInstance()
            val dayOfYear = calendar.get(Calendar.DAY_OF_YEAR)
            val messageIndex = dayOfYear % zodiac.messages.size
            val dayOfMonth = calendar.get(Calendar.DAY_OF_MONTH)

            // Calculate moon phase
            val moonPhaseIndex = (dayOfMonth / 4) % 8
            val moonPhase = moonPhases[moonPhaseIndex]

            // Calculate lucky number and energy
            val luckyNumber = ((Math.abs(sunSignKey.hashCode()) + dayOfYear) % 90) + 1
            val baseEnergy = 70
            val variation = (sunSignKey.hashCode() + dayOfMonth) % 25
            val energyPercent = minOf(95, baseEnergy + Math.abs(variation))

            // Update widget views
            views.setTextViewText(R.id.sun_emoji, zodiac.emoji)
            views.setTextViewText(R.id.sun_sign, zodiac.name)
            views.setTextViewText(R.id.moon_emoji, moonPhase.first)
            views.setTextViewText(R.id.daily_message, zodiac.messages[messageIndex])
            views.setTextViewText(R.id.lucky_number, luckyNumber.toString())
            views.setTextViewText(R.id.energy_percent, "$energyPercent%")

            // Set click intent to open app
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("astrodating://premium/daily-horoscope")
                setPackage(context.packageName)
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_container, pendingIntent)

            // Update the widget
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    data class ZodiacSign(
        val name: String,
        val emoji: String,
        val messages: List<String>
    )
}
