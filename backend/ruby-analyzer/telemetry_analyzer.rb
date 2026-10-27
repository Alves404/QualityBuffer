#!/usr/bin/env ruby
# frozen_string_literal: true

# ==============================================================================
# My Quality 4k - Ruby Telemetry & Route Cache Diagnostic Analyzer
#
# Processes network chunk telemetry logs collected from the Chrome extension
# (via backend/data/network_logs.json), calculates CDN node latency stability,
# bandwidth percentiles (P50 / P95), and generates a route optimization report.
#
# Assisted engineering by Argon (Google Antigravity).
# License: GPL-3.0
# ==============================================================================

require 'json'
require 'time'
require 'fileutils'

module MyQuality4k
  class TelemetryAnalyzer
    DATA_DIR = File.expand_path('../data', __dir__)
    INPUT_LOG_FILE = File.join(DATA_DIR, 'network_logs.json')
    OUTPUT_REPORT_FILE = File.join(DATA_DIR, 'route_optimization_report.json')

    ITAG_DESCRIPTIONS = {
      '313' => '2160p (4K) VP9 30fps SDR',
      '315' => '2160p (4K) VP9 60fps SDR',
      '308' => '1440p (2K) VP9 60fps SDR',
      '271' => '1440p (2K) VP9 30fps SDR',
      '248' => '1080p VP9 30fps SDR',
      '303' => '1080p VP9 60fps SDR',
      '401' => '2160p (4K) AV1 (Software-Heavy)',
      '251' => 'Audio WebM Opus (160kbps)'
    }.freeze

    def initialize(log_path = INPUT_LOG_FILE)
      @log_path = log_path
      FileUtils.mkdir_p(DATA_DIR)
    end

    def run
      data = load_telemetry_data
      records = data['recentRecords'] || []
      cdn_routes = data['cdnRoutes'] || {}

      throughputs = records.filter_map { |r| r.dig('networkChunk', 'throughputMbps') }.select(&:positive?).sort
      durations = records.filter_map { |r| r.dig('networkChunk', 'durationMs') }.select(&:positive?).sort
      buffers = records.filter_map { |r| r.dig('playerMetrics', 'bufferAheadSec') }.select(&:positive?).sort

      report = {
        project: 'My Quality 4k',
        component: 'Ruby Telemetry & Route Cache Analyzer',
        ai_assisted_engineering: 'Argon (Google Antigravity)',
        generated_at: Time.now.utc.iso8601,
        sample_size: records.size,
        bandwidth_metrics: {
          median_p50_mbps: percentile(throughputs, 0.50),
          peak_p95_mbps: percentile(throughputs, 0.95),
          minimum_mbps: throughputs.first || 0.0
        },
        latency_metrics: {
          median_p50_ms: percentile(durations, 0.50),
          tail_p95_ms: percentile(durations, 0.95)
        },
        buffer_stability: {
          median_buffer_ahead_sec: percentile(buffers, 0.50),
          min_buffer_ahead_sec: buffers.first || 0.0
        },
        ranked_cdn_nodes: rank_cdn_nodes(cdn_routes),
        stream_format_distribution: summarize_itags(data['itagCounts'] || {}),
        tuning_recommendation: build_recommendation(percentile(throughputs, 0.50), percentile(durations, 0.95))
      }

      File.write(OUTPUT_REPORT_FILE, JSON.pretty_generate(report))
      print_summary(report)
      report
    end

    private

    def load_telemetry_data
      return default_empty_state unless File.exist?(@log_path)

      JSON.parse(File.read(@log_path))
    rescue JSON::ParserError
      default_empty_state
    end

    def default_empty_state
      {
        'recentRecords' => [],
        'cdnRoutes' => {},
        'itagCounts' => {}
      }
    end

    def percentile(sorted_array, fraction)
      return 0.0 if sorted_array.empty?

      index = (fraction * (sorted_array.length - 1)).round
      sorted_array[index].round(2)
    end

    def rank_cdn_nodes(cdn_routes)
      cdn_routes.values.map do |node|
        chunks = [node['chunks'].to_i, 1].max
        error_rate = ((node['errors'].to_i.to_f / chunks) * 100.0).round(2)
        score = (node['avgThroughputMbps'].to_f * 2.0) - (node['avgDurationMs'].to_f * 0.05) - (error_rate * 5.0)
        {
          host: node['host'],
          chunks_served: node['chunks'].to_i,
          avg_throughput_mbps: node['avgThroughputMbps'].to_f,
          avg_latency_ms: node['avgDurationMs'].to_i,
          error_rate_percent: error_rate,
          stability_score: score.round(2)
        }
      end.sort_by { |n| -n[:stability_score] }
    end

    def summarize_itags(itag_counts)
      itag_counts.each_with_object({}) do |(itag, count), acc|
        label = ITAG_DESCRIPTIONS[itag.to_s] || "Stream itag=#{itag}"
        acc[label] = count
      end
    end

    def build_recommendation(median_mbps, p95_latency_ms)
      if median_mbps.zero?
        'Awaiting active YouTube 4K playback telemetry logs to compute route parameters.'
      elsif median_mbps >= 25.0 && p95_latency_ms < 350
        'Optimal 4K (hd2160) bandwidth detected. Keep VP9 SDR hardware profile active and lock quality range to hd2160.'
      elsif median_mbps >= 14.0
        'Moderate bandwidth detected. Enable MSE Micro-Gap stabilizer and allow Smart Drop Guard fallback to hd1440.'
      else
        'Constrained network throughput detected. Recommend pre-buffering or locking target quality to hd1080/hd1440.'
      end
    end

    def print_summary(report)
      puts '===================================================================='
      puts ' MY QUALITY 4K - TELEMETRY & ROUTE CACHE REPORT'
      puts '===================================================================='
      puts " Generated At       : #{report[:generated_at]}"
      puts " Samples Analyzed   : #{report[:sample_size]}"
      puts " P50 Bandwidth      : #{report.dig(:bandwidth_metrics, :median_p50_mbps)} Mbps"
      puts " P95 Bandwidth      : #{report.dig(:bandwidth_metrics, :peak_p95_mbps)} Mbps"
      puts " P50 Chunk Latency  : #{report.dig(:latency_metrics, :median_p50_ms)} ms"
      puts " Recommendation     : #{report[:tuning_recommendation]}"
      puts " Report Saved To    : #{OUTPUT_REPORT_FILE}"
      puts '===================================================================='
    end
  end
end

MyQuality4k::TelemetryAnalyzer.new.run if $PROGRAM_NAME == __FILE__
