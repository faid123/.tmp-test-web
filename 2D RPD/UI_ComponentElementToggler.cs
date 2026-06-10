using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public delegate void ToggleEvent(RPDPlaceable rpdComponent, bool isOn);
public class UI_ComponentElementToggler : MonoBehaviour
{
	public static UI_ComponentElementToggler instance;

	public event ToggleEvent toggleEvent;

	public Dictionary<RPDPlaceable, bool> toggleState = new Dictionary<RPDPlaceable, bool>();

	private void Awake()
	{
		if (instance == null)
			instance = this;
	}

	private void Start()
	{
		//FindObjectsOfTypeAll is deprecated, but needed to find inactive objects in scene
		//FindObjectsOfType in Unity version 2020 has ability to find inactive objects, but not 2019.3
		Object[] togglableElementsObjs = FindObjectsOfTypeAll(typeof(UI_TogglableComponentElement));

		foreach (Object entry in togglableElementsObjs)
		{
			UI_TogglableComponentElement togglable = entry as UI_TogglableComponentElement;

			if (entry == null)
				continue;

			togglable.Initialise();
		}
	}
	/// <summary>
	/// Handles Toggle state
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	public void Toggle(RPDPlaceable rpdComponent)
	{
		//if first time toggling, we always toggle on
		if (!toggleState.TryGetValue(rpdComponent, out bool isOn))
		{
			ToggleOn(rpdComponent);
			return;
		}

		//subsequent toggles, we flip its state
		if (isOn)
			ToggleOff(rpdComponent);
		else
			ToggleOn(rpdComponent);
	}
	/// <summary>
	/// Registers Toggle event as ON
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	public void ToggleOn(RPDPlaceable rpdComponent)
	{
		RegisterToggleState(rpdComponent, true);
		RaiseToggleEvent(rpdComponent, true);
	}
	/// <summary>
	/// Regiesters Toggle event as OFF
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	public void ToggleOff(RPDPlaceable rpdComponent)
	{
		RegisterToggleState(rpdComponent, false);
		RaiseToggleEvent(rpdComponent, false);
	}
	/// <summary>
	/// Handles the registering of Toggle state
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	/// <param name="isOn">Bool to check if Toggle is ON</param>
	void RegisterToggleState(RPDPlaceable rpdComponent, bool isOn)
	{
		if (!toggleState.TryGetValue(rpdComponent, out bool value))
		{
			toggleState.Add(rpdComponent, isOn);
		}
		else
		{
			toggleState[rpdComponent] = isOn;
		}
	}
	/// <summary>
	/// Invoke Toggle event
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	/// <param name="isOn">Bool to check if Toggle is ON</param>
	void RaiseToggleEvent(RPDPlaceable rpdComponent, bool isOn)
	{
		toggleEvent?.Invoke(rpdComponent, isOn);
	}
}
