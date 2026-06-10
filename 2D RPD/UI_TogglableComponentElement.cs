using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

public class UI_TogglableComponentElement : MonoBehaviour
{
	public List<RPDPlaceable> rpdComponents = new List<RPDPlaceable>();

	[SerializeField]
	protected BoolUnityEvent unityToggleEventRaised = new BoolUnityEvent();

	public event ToggleEvent toggleEventRaised;

	bool initialised = false;

	//Initialise() will now be called on the UI_ComponentElementToggler itself on Awake
	//protected virtual void Start()
	//{
	//	Initialise();
	//}

	public virtual void Initialise()
	{
		if (initialised)
			return;

		UI_ComponentElementToggler.instance.toggleEvent += EventRaised;
		initialised = true;
	}

	protected virtual void OnDestroy()
	{
		Deinitialise();
	}
	protected virtual void Deinitialise()
	{
		UI_ComponentElementToggler.instance.toggleEvent -= EventRaised;
		initialised = false;
	}
	/// <summary>
	/// Handles raising of PerformCheck/PerformAction events
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	/// <param name="isOn">Bool to check if is ON</param>
	protected virtual void EventRaised(RPDPlaceable rpdComponent, bool isOn)
	{
		if (!PerformChecks(rpdComponent, isOn))
			return;

		PerformActions(rpdComponent, isOn);
	}
	/// <summary>
	/// the checks needed to pass before actions can be performed
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	/// <param name="isOn">Bool to check if is ON</param>
	/// <returns></returns>
	protected virtual bool PerformChecks(RPDPlaceable rpdComponent, bool isOn)
	{
		if (!rpdComponents.Contains(rpdComponent))
			return false;

		return true;
	}
	/// <summary>
	/// the action that will be performed once checks have passed
	/// </summary>
	/// <param name="rpdComponent">Input of RPDPlaceable component</param>
	/// <param name="isOn">Bool to set Toggle is ON</param>
	protected virtual void PerformActions(RPDPlaceable rpdComponent, bool isOn)
	{
		unityToggleEventRaised?.Invoke(isOn);
		toggleEventRaised?.Invoke(rpdComponent, isOn);
	}
}