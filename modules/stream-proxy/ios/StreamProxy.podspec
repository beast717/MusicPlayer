Pod::Spec.new do |s|
  s.name           = 'StreamProxy'
  s.version        = '1.0.0'
  s.summary        = 'Local HTTP proxy that fetches YouTube audio in small ranges'
  s.description    = s.summary
  s.author         = ''
  s.homepage       = 'https://github.com/beast717/MusicPlayer'
  s.license        = { :type => 'Private' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.10'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.swift'
end
