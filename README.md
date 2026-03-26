# Tesla Energy

Monitor your Tesla solar panels and Powerwalls from Raycast.

## Commands

### Solar Production

View solar generation, home consumption, Powerwall charge/discharge, and grid import/export — charted by time period.

- Switch between **Today**, **Past 7 Days**, **Past 30 Days**, and **Past Year** via the Action Panel
- Charts adapt per period: area charts for intraday, bar charts for multi-day views
- Sidebar shows self-powered percentage (solar + Powerwall), energy totals, and grid net

### Solar Status (Menu Bar)

Live solar wattage in the menu bar, refreshed every 10 minutes.

- Shows current production, Powerwall charge level, grid status, and home consumption
- Displays `—` when solar production is below 50 W (nighttime / minimal production)

## Setup

This extension requires a Tesla Fleet API application and OAuth credentials configured via the Raycast PKCE proxy. See `.github/docs/SETUP.md` for the full procedure.

## Requirements

- Tesla account with solar panels and/or Powerwalls
- Tesla Fleet API client registered with `energy_device_data` scope
- Raycast PKCE proxy configured with your Tesla OAuth credentials
