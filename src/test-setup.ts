import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

/**
 * Boots the Angular testing platform for the Vitest suite.
 *
 * The project runs zoneless in the application, and the tests exercise services
 * and components through signals, so no zone.js patch is loaded here.
 */
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());