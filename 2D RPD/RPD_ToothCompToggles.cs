using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class RPD_ToothCompToggles : MonoBehaviour
{
	// add to your btn
	List<RetainerToggle> ToggleList = new List<RetainerToggle>();
	Dictionary<string, List<RetainerToggle>> categorizedToggles = new();

	private void Awake()
	{
		RetainerToggle[] RT = Resources.FindObjectsOfTypeAll<RetainerToggle>(); // FindObjectsOfType<RetainerToggle>();

		for (int i = 0; i < RT.Length; i++)
		{
			ToggleList.Add(RT[i]);

			//print("Adding" + RT[i]);
		}

		//print(RT.Length);

		categorizedToggles["Anterior"] = new();
		categorizedToggles["Posterior"] = new();
		categorizedToggles["Clasp"] = new();
		categorizedToggles["Ring"] = new();
		categorizedToggles["Simple"] = new();
		categorizedToggles["Embrasure"] = new();
		categorizedToggles["Reverse"] = new();
		categorizedToggles["Half"] = new();
		categorizedToggles["Multi"] = new();
		categorizedToggles["T-Assembly"] = new();
		categorizedToggles["ModT-Assembly"] = new();
		categorizedToggles["I-Assembly"] = new();
		categorizedToggles["RPI"] = new();
		categorizedToggles["Slot"] = new();
		categorizedToggles["Recip"] = new();
		categorizedToggles["Bar_Toggles"] = new();


		foreach (var btn in ToggleList)
		{
			if (btn.name.Contains("Anterior"))
				categorizedToggles["Anterior"].Add(btn);
			else if (btn.name.Contains("Posterior"))
				categorizedToggles["Posterior"].Add(btn);
			else if (btn.name.Contains("Clasp") && !btn.name.Contains("Recip"))
				categorizedToggles["Clasp"].Add(btn);
			else if (btn.name.Contains("Ring"))
				categorizedToggles["Ring"].Add(btn);
			else if (btn.name.Contains("Simple"))
				categorizedToggles["Simple"].Add(btn);
			else if (btn.name.Contains("Embrasure"))
				categorizedToggles["Embrasure"].Add(btn);
			else if (btn.name.Contains("Reverse"))
				categorizedToggles["Reverse"].Add(btn);
			else if (btn.name.Contains("Half"))
				categorizedToggles["Half"].Add(btn);
			else if (btn.name.Contains("Multi"))
				categorizedToggles["Multi"].Add(btn);
			else if (btn.name.Contains("T-Assembly") && !btn.name.Contains("Mod"))
				categorizedToggles["T-Assembly"].Add(btn);
			else if (btn.name.Contains("ModT-Assembly"))
				categorizedToggles["ModT-Assembly"].Add(btn);
			else if (btn.name.Contains("I-Assembly"))
				categorizedToggles["I-Assembly"].Add(btn);
			else if (btn.name.Contains("RPI"))
				categorizedToggles["RPI"].Add(btn);
			else if (btn.name.Contains("Slot"))
				categorizedToggles["Slot"].Add(btn);
			else if (btn.name.Contains("Recip"))
				categorizedToggles["Recip"].Add(btn);
			else if (btn.name.Contains("Bar_Toggles"))
				categorizedToggles["Bar_Toggles"].Add(btn);
		}
	}

	public void ToggleCategory(string category)
	{
		if (categorizedToggles.TryGetValue(category, out var buttons))
		{
			foreach (var btn in buttons)
			{
				if (btn.isActiveAndEnabled)
					btn.TurnOn();
			}
		}
	}

	/// <summary>
	/// Turns ON all the anterior Rest UI on template
	/// </summary>
	//Turn on Anterior Rests only
	public void ToggleAnteriorBtn()
	{
		ToggleCategory("Anterior");
	}
	/// <summary>
	/// Turns ON all the posterior Rest UI on template
	/// </summary>
	//Turn on Posterior Rests only
	public void TogglePosteriorBtn()
	{
		ToggleCategory("Posterior");
	}
	/// <summary>
	/// Turns ON all the Retainer clasp UI on template
	/// </summary>
	public void ToggleClaspBtn()
	{
		ToggleCategory("Clasp");
	}
	/// <summary>
	/// Turns ON all the Retainer ring UI on template
	/// </summary>
	public void ToggleRingBtn()
	{
		ToggleCategory("Ring");
	}
	/// <summary>
	/// Turns ON all the Simple Assembly UI on template
	/// </summary>
	public void ToggleSimpleCircumBtn()
	{
		ToggleCategory("Simple");
	}
	/// <summary>
	/// Turns ON all Embrasure Assembly UI on template
	/// </summary>
	public void ToggleEmbrasureBtn()
	{
		ToggleCategory("Embrasure");
	}
	/// <summary>
	/// Turns ON all the ReverseCircumferential Assembly UI on template
	/// </summary>
	public void ToggleReverseCircumBtn()
	{
		ToggleCategory("Reverse");
	}
	/// <summary>
	/// Turns ON all the Half Assembly UI on template
	/// </summary>
	public void ToggleHalfBtn()
	{
		ToggleCategory("Half");
	}
	/// <summary>
	/// Turns ON all the Multi Circumferential Assembly UI on template
	/// </summary>
	public void ToggleMultiCircumBtn()
	{
		ToggleCategory("Multi");
	}
	/// <summary>
	/// Turns ON all the TBar Assembly UI on template
	/// </summary>
	public void ToggleTbarBtn()
	{
		ToggleCategory("T-Assembly");
	}
	/// <summary>
	/// Turns ON all the Mod TBar Assembly UI on template
	/// </summary>
	public void ToggleModTbarBtn()
	{
		ToggleCategory("ModT-Assembly");
	}
	/// <summary>
	/// Turns ON all the IBar Assembly UI on template
	/// </summary>
	public void ToggleIbarBtn()
	{
		ToggleCategory("I-Assembly");
	}
	/// <summary>
	/// Turns ON all the RPI Assembly UI on template
	/// </summary>
	public void ToggleRPIBtn()
	{
		ToggleCategory("RPI");
	}
	/// <summary>
	/// Turns ON all the Ball Retainer Assembly UI on template
	/// </summary>
	public void ToggleBallRetainersBtn()
	{
		ToggleCategory("Slot");
	}

	/// <summary>
	/// Turns ON all the Reciprocating Clasp Assembly UI on template
	/// </summary>
	public void ToggleRecipClaspBtn()
	{
		ToggleCategory("Recip");
	}
	/// <summary>
	/// Turns ON all the Bar UI on template
	/// </summary>
	public void ToggleBarsBtn()
	{
		ToggleCategory("Bar_Toggles");
	}
	/* public void TurnOnBtn()
     {
         //check sibling, generic tooth, if tooth present
         foreach (var btn in ToggleList)
         {
             btn.TurnOn();
         }
     }*/

	/// <summary>
	/// Turns OFF any and all UI buttons on template
	/// </summary>
	public void TurnOffBtn()
	{
		UI_CursorImageSetting.instance.SetCursorToDefault();

		foreach (var btn in ToggleList)
		{
			//if (btn.isActiveAndEnabled)
			//{
			//print("button is active and turning off");
			btn.TurnOff();
			//}
		}
	}
}
